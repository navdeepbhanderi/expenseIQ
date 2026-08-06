import { Money } from '@/common/money/money';
import {
  AmortizationError,
  buildSchedule,
  computeEmi,
  simulatePrepayment,
  summariseLoan,
  type LoanTerms,
} from './amortization';

/** ₹60 L home loan at 8.4% over 20 years — the design 2d loan. */
const homeLoan: LoanTerms = {
  principal: Money.fromMajor(60_00_000),
  annualRatePercent: 8.4,
  tenureMonths: 240,
  firstEmiDate: new Date('2018-04-18T00:00:00.000Z'),
};

describe('computeEmi', () => {
  it('matches a published reference figure', () => {
    // ₹10,00,000 at 9% over 10 years is ~₹12,668 in every EMI calculator.
    const emi = computeEmi(Money.fromMajor(10_00_000), 9, 120);
    expect(emi.toMajor()).toBeCloseTo(12_668, 0);
  });

  it('matches a second reference figure', () => {
    // ₹25,00,000 at 7.5% over 20 years is ~₹20,140.
    const emi = computeEmi(Money.fromMajor(25_00_000), 7.5, 240);
    expect(emi.toMajor()).toBeCloseTo(20_140, 0);
  });

  it('divides evenly for an interest-free loan', () => {
    // The closed form divides by zero at 0%, so this path is separate.
    const emi = computeEmi(Money.fromMajor(1_20_000), 0, 12);
    expect(emi.toMajor()).toBe(10_000);
  });

  it('rejects nonsense terms', () => {
    expect(() => computeEmi(Money.fromMajor(1000), -1, 12)).toThrow(
      AmortizationError,
    );
    expect(() => computeEmi(Money.fromMajor(1000), 8, 0)).toThrow(
      AmortizationError,
    );
    expect(() => computeEmi(Money.fromMajor(1000), 8, 1.5)).toThrow(
      AmortizationError,
    );
  });
});

describe('buildSchedule', () => {
  it('produces one row per month', () => {
    expect(buildSchedule(homeLoan)).toHaveLength(240);
  });

  it('repays the principal exactly — no more, no less', () => {
    // The invariant that matters: rounding each EMI up accumulates a small
    // overpayment, so without adjusting the final instalment the loan would
    // repay more than was borrowed.
    const schedule = buildSchedule(homeLoan);
    const principalRepaid = Money.sum(schedule.map((row) => row.principal));

    expect(principalRepaid.equals(homeLoan.principal)).toBe(true);
    expect(schedule.at(-1)?.balance.isZero).toBe(true);
  });

  it('keeps every payment equal to principal plus interest', () => {
    for (const row of buildSchedule(homeLoan)) {
      expect(row.principal.add(row.interest).equals(row.payment)).toBe(true);
    }
  });

  it('shifts from interest-heavy to principal-heavy over the term', () => {
    const schedule = buildSchedule(homeLoan);
    const first = schedule[0]!;
    const last = schedule.at(-1)!;

    expect(first.interest.greaterThan(first.principal)).toBe(true);
    expect(last.principal.greaterThan(last.interest)).toBe(true);
  });

  it('never lets the balance go negative', () => {
    for (const row of buildSchedule(homeLoan)) {
      expect(row.balance.isNegative).toBe(false);
    }
  });

  it('advances the payment date one month at a time, clamping short months', () => {
    const schedule = buildSchedule({
      ...homeLoan,
      firstEmiDate: new Date('2026-01-31T00:00:00.000Z'),
      tenureMonths: 3,
      emi: Money.fromMajor(25_00_000),
    });

    expect(schedule.map((row) => row.date.toISOString().slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('handles a zero-interest loan', () => {
    const schedule = buildSchedule({
      principal: Money.fromMajor(1_20_000),
      annualRatePercent: 0,
      tenureMonths: 12,
      firstEmiDate: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(schedule).toHaveLength(12);
    expect(Money.sum(schedule.map((r) => r.interest)).isZero).toBe(true);
    expect(Money.sum(schedule.map((r) => r.principal)).toMajor()).toBe(
      1_20_000,
    );
  });

  it('refuses an EMI too small to ever repay the loan', () => {
    // Below the monthly interest the balance grows forever and the loop would
    // never terminate — a hang, not an error, without this guard.
    expect(() =>
      buildSchedule({ ...homeLoan, emi: Money.fromMajor(100) }),
    ).toThrow(AmortizationError);
  });

  it('finishes early when the user`s EMI exceeds the computed one', () => {
    const schedule = buildSchedule({
      ...homeLoan,
      emi: Money.fromMajor(75_000),
    });

    expect(schedule.length).toBeLessThan(240);
    expect(schedule.at(-1)?.balance.isZero).toBe(true);
  });
});

describe('summariseLoan', () => {
  it('reports the position partway through, in the shape design 2d renders', () => {
    const summary = summariseLoan(homeLoan, 98);

    expect(summary.emisPaid).toBe(98);
    expect(summary.emisRemaining).toBe(142);

    // Principal paid + outstanding must always reconstruct the original.
    expect(
      summary.principalPaid.add(summary.outstanding).equals(homeLoan.principal),
    ).toBe(true);

    // Total paid is the two components, which is what the design shows split.
    expect(
      summary.principalPaid.add(summary.interestPaid).equals(summary.totalPaid),
    ).toBe(true);

    // Early in a 20-year loan, interest dominates.
    expect(summary.interestPaid.greaterThan(summary.principalPaid)).toBe(true);
    expect(summary.principalClearedPercent).toBeGreaterThan(0);
    expect(summary.principalClearedPercent).toBeLessThan(100);
  });

  it('reports the closure date', () => {
    // 240 monthly payments from April 2018 ends in March 2038 —
    // design 2d's "Closes Mar 2038".
    const summary = summariseLoan(homeLoan, 98);
    expect(summary.closureDate.toISOString().slice(0, 7)).toBe('2038-03');
  });

  it('points at the next instalment', () => {
    const summary = summariseLoan(homeLoan, 98);
    expect(summary.nextEmiDate?.toISOString().slice(0, 10)).toBe('2026-06-18');
  });

  it('reports a fresh loan as nothing paid', () => {
    const summary = summariseLoan(homeLoan, 0);

    expect(summary.outstanding.equals(homeLoan.principal)).toBe(true);
    expect(summary.principalPaid.isZero).toBe(true);
    expect(summary.principalClearedPercent).toBe(0);
  });

  it('reports a settled loan as fully cleared with no next payment', () => {
    const summary = summariseLoan(homeLoan, 240);

    expect(summary.outstanding.isZero).toBe(true);
    expect(summary.principalClearedPercent).toBeCloseTo(100, 6);
    expect(summary.nextEmiDate).toBeNull();
    expect(summary.emisRemaining).toBe(0);
  });

  it('clamps an out-of-range paid count instead of producing nonsense', () => {
    expect(summariseLoan(homeLoan, -5).emisPaid).toBe(0);
    expect(summariseLoan(homeLoan, 9999).emisPaid).toBe(240);
  });
});

describe('simulatePrepayment', () => {
  it('saves interest and shortens the term', () => {
    const result = simulatePrepayment(homeLoan, 98, Money.fromMajor(5_00_000));

    expect(result.interestSaved.isPositive).toBe(true);
    expect(result.monthsSaved).toBeGreaterThan(0);
    expect(result.newTenureMonths).toBeLessThan(240);
  });

  it('saves more the larger the prepayment', () => {
    const small = simulatePrepayment(homeLoan, 98, Money.fromMajor(1_00_000));
    const large = simulatePrepayment(homeLoan, 98, Money.fromMajor(5_00_000));

    expect(large.interestSaved.greaterThan(small.interestSaved)).toBe(true);
    expect(large.monthsSaved).toBeGreaterThan(small.monthsSaved);
  });

  it('never claims to save more than the interest that remains', () => {
    const summary = summariseLoan(homeLoan, 98);
    const remainingInterest = summary.totalInterestOverLife.subtract(
      summary.interestPaid,
    );

    const result = simulatePrepayment(homeLoan, 98, Money.fromMajor(10_00_000));
    expect(result.interestSaved.greaterThan(remainingInterest)).toBe(false);
  });

  it('clearing the balance outright saves all remaining interest', () => {
    const summary = summariseLoan(homeLoan, 98);
    const result = simulatePrepayment(homeLoan, 98, summary.outstanding);

    expect(result.monthsSaved).toBe(summary.emisRemaining);
    expect(result.prepayment.equals(summary.outstanding)).toBe(true);
  });

  it('caps an overpayment at the outstanding balance', () => {
    const summary = summariseLoan(homeLoan, 98);
    const result = simulatePrepayment(homeLoan, 98, Money.fromMajor(99_00_000));

    // Nobody should be told to hand over more than they owe.
    expect(result.prepayment.equals(summary.outstanding)).toBe(true);
  });

  it('rejects a non-positive prepayment', () => {
    expect(() => simulatePrepayment(homeLoan, 98, Money.zero())).toThrow(
      AmortizationError,
    );
  });

  it('rejects prepaying a settled loan', () => {
    expect(() =>
      simulatePrepayment(homeLoan, 240, Money.fromMajor(1000)),
    ).toThrow(AmortizationError);
  });
});
