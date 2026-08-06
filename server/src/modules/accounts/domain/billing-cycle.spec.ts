import { Money } from '@/common/money/money';
import {
  BillingCycleError,
  clampToMonth,
  computeBillingCycle,
  computeCardPosition,
  lastDayOfMonth,
} from './billing-cycle';

const iso = (date: Date): string => date.toISOString().slice(0, 10);

describe('computeBillingCycle', () => {
  it('reproduces the card in design 2d', () => {
    // "Statement 28 Jul · due 12 Aug", viewed on 5 Aug → "Due in 7 days".
    const cycle = computeBillingCycle({
      statementDay: 28,
      dueDay: 12,
      asOf: new Date('2026-08-05T00:00:00.000Z'),
    });

    expect(iso(cycle.lastStatementDate)).toBe('2026-07-28');
    expect(iso(cycle.dueDate)).toBe('2026-08-12');
    expect(cycle.daysUntilDue).toBe(7);
    expect(cycle.isOverdue).toBe(false);
  });

  it('keeps the due date in the same month when it falls after the statement', () => {
    // The spec's own example: statement on the 5th, due on the 25th.
    const cycle = computeBillingCycle({
      statementDay: 5,
      dueDay: 25,
      asOf: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(iso(cycle.lastStatementDate)).toBe('2026-08-05');
    expect(iso(cycle.dueDate)).toBe('2026-08-25');
  });

  it('rolls the due date forward when the days are equal', () => {
    // A balance cannot fall due the instant the statement creating it is cut.
    const cycle = computeBillingCycle({
      statementDay: 15,
      dueDay: 15,
      asOf: new Date('2026-08-20T00:00:00.000Z'),
    });

    expect(iso(cycle.lastStatementDate)).toBe('2026-08-15');
    expect(iso(cycle.dueDate)).toBe('2026-09-15');
  });

  it('clamps a 31st statement day in short months', () => {
    const cycle = computeBillingCycle({
      statementDay: 31,
      dueDay: 20,
      asOf: new Date('2026-02-28T00:00:00.000Z'),
    });

    // 2026 is not a leap year, so the statement lands on the 28th — it must
    // not roll into 3 March, which naive date arithmetic does.
    expect(iso(cycle.lastStatementDate)).toBe('2026-02-28');
    expect(iso(cycle.dueDate)).toBe('2026-03-20');
  });

  it('uses 29 February in a leap year', () => {
    const cycle = computeBillingCycle({
      statementDay: 31,
      dueDay: 20,
      asOf: new Date('2028-02-29T00:00:00.000Z'),
    });

    expect(iso(cycle.lastStatementDate)).toBe('2028-02-29');
  });

  it('rolls forward when clamping collapses the due date onto the statement', () => {
    // Statement 28th, due 30th. Fine for eleven months — but in a non-leap
    // February the 30th clamps back to the 28th, and the bill would appear
    // due the very day it was generated. Found by the property test below.
    const cycle = computeBillingCycle({
      statementDay: 28,
      dueDay: 30,
      asOf: new Date('2026-02-28T00:00:00.000Z'),
    });

    expect(iso(cycle.lastStatementDate)).toBe('2026-02-28');
    expect(iso(cycle.dueDate)).toBe('2026-03-30');
  });

  it('recovers the full day after a clamped month rather than staying clamped', () => {
    // Anchoring to the clamped date would leave the card permanently on the
    // 28th once it passed through February.
    const cycle = computeBillingCycle({
      statementDay: 31,
      dueDay: 20,
      asOf: new Date('2026-02-28T00:00:00.000Z'),
    });

    expect(iso(cycle.nextStatementDate)).toBe('2026-03-31');
  });

  it('reports an overdue bill with a negative day count', () => {
    // Design 2f renders this as "−2d · Overdue".
    const cycle = computeBillingCycle({
      statementDay: 28,
      dueDay: 12,
      asOf: new Date('2026-08-14T00:00:00.000Z'),
    });

    expect(cycle.daysUntilDue).toBe(-2);
    expect(cycle.isOverdue).toBe(true);
  });

  it('handles a statement day later in the month than today', () => {
    const cycle = computeBillingCycle({
      statementDay: 28,
      dueDay: 12,
      asOf: new Date('2026-08-03T00:00:00.000Z'),
    });

    expect(iso(cycle.lastStatementDate)).toBe('2026-07-28');
    expect(iso(cycle.nextStatementDate)).toBe('2026-08-28');
  });

  it('crosses a year boundary', () => {
    const cycle = computeBillingCycle({
      statementDay: 28,
      dueDay: 12,
      asOf: new Date('2026-01-05T00:00:00.000Z'),
    });

    expect(iso(cycle.lastStatementDate)).toBe('2025-12-28');
    expect(iso(cycle.dueDate)).toBe('2026-01-12');
  });

  it('is timezone-independent', () => {
    // Billing days are calendar facts. Reading them in local time would make
    // the answer depend on where the server happens to run.
    const late = computeBillingCycle({
      statementDay: 28,
      dueDay: 12,
      asOf: new Date('2026-08-05T23:59:59.000Z'),
    });
    const early = computeBillingCycle({
      statementDay: 28,
      dueDay: 12,
      asOf: new Date('2026-08-05T00:00:00.000Z'),
    });

    expect(late.daysUntilDue).toBe(early.daysUntilDue);
  });

  it('rejects impossible days', () => {
    expect(() => computeBillingCycle({ statementDay: 0, dueDay: 12 })).toThrow(
      BillingCycleError,
    );
    expect(() => computeBillingCycle({ statementDay: 32, dueDay: 12 })).toThrow(
      BillingCycleError,
    );
    expect(() => computeBillingCycle({ statementDay: 5, dueDay: 1.5 })).toThrow(
      BillingCycleError,
    );
  });

  it('never produces a due date before its statement', () => {
    // Property check across every day pairing and every month of a year.
    for (let statementDay = 1; statementDay <= 31; statementDay += 1) {
      for (let dueDay = 1; dueDay <= 31; dueDay += 1) {
        for (let month = 0; month < 12; month += 1) {
          const cycle = computeBillingCycle({
            statementDay,
            dueDay,
            asOf: new Date(Date.UTC(2026, month, 15)),
          });
          expect(cycle.dueDate.getTime()).toBeGreaterThan(
            cycle.lastStatementDate.getTime(),
          );
        }
      }
    }
  });
});

describe('clampToMonth', () => {
  it('clamps to the real length of the month', () => {
    expect(iso(clampToMonth(2026, 1, 31))).toBe('2026-02-28');
    expect(iso(clampToMonth(2028, 1, 31))).toBe('2028-02-29');
    expect(iso(clampToMonth(2026, 3, 31))).toBe('2026-04-30');
  });

  it('rolls the year for out-of-range months', () => {
    expect(iso(clampToMonth(2026, 12, 5))).toBe('2027-01-05');
    expect(iso(clampToMonth(2026, -1, 5))).toBe('2025-12-05');
  });
});

describe('lastDayOfMonth', () => {
  it('knows February', () => {
    expect(lastDayOfMonth(2026, 1)).toBe(28);
    expect(lastDayOfMonth(2028, 1)).toBe(29);
    expect(lastDayOfMonth(2100, 1)).toBe(28); // century, not a leap year
    expect(lastDayOfMonth(2000, 1)).toBe(29); // divisible by 400, is one
  });
});

describe('computeCardPosition', () => {
  const card = {
    outstanding: Money.fromMajor(23_480),
    creditLimit: Money.fromMajor(2_00_000),
  };

  it('reproduces the numbers in design 2d', () => {
    const position = computeCardPosition(card);

    expect(position.available.toMajor()).toBe(1_76_520);
    expect(Math.round(position.utilizationPercent)).toBe(12);
    expect(position.isHighUtilization).toBe(false);
  });

  it('flags utilisation above the 30% line', () => {
    const position = computeCardPosition({
      outstanding: Money.fromMajor(80_000),
      creditLimit: Money.fromMajor(2_00_000),
    });

    expect(position.isHighUtilization).toBe(true);
  });

  it('rounds the minimum due up', () => {
    // Rounding down leaves paise outstanding, which can trigger a late fee on
    // a bill the user believes they settled.
    const position = computeCardPosition({
      outstanding: Money.fromMajor(23_481),
      creditLimit: Money.fromMajor(2_00_000),
      minDuePercent: 5,
    });

    expect(position.minimumDue.minor).toBe(117_405);
  });

  it('applies the issuer floor on a small balance', () => {
    const position = computeCardPosition({
      outstanding: Money.fromMajor(500),
      creditLimit: Money.fromMajor(2_00_000),
    });

    // 5% of ₹500 is ₹25, below the ₹100 floor.
    expect(position.minimumDue.toMajor()).toBe(100);
  });

  it('never asks for more than is owed', () => {
    const position = computeCardPosition({
      outstanding: Money.fromMajor(40),
      creditLimit: Money.fromMajor(2_00_000),
    });

    expect(position.minimumDue.toMajor()).toBe(40);
  });

  it('asks for nothing on a settled card', () => {
    const position = computeCardPosition({
      outstanding: Money.zero(),
      creditLimit: Money.fromMajor(2_00_000),
    });

    expect(position.minimumDue.isZero).toBe(true);
    expect(position.available.toMajor()).toBe(2_00_000);
  });

  it('reports zero available on an over-limit card, not a negative', () => {
    const position = computeCardPosition({
      outstanding: Money.fromMajor(2_10_000),
      creditLimit: Money.fromMajor(2_00_000),
    });

    expect(position.available.isZero).toBe(true);
    expect(position.isHighUtilization).toBe(true);
  });

  it('treats a zero limit as 0% rather than dividing by zero', () => {
    const position = computeCardPosition({
      outstanding: Money.fromMajor(1_000),
      creditLimit: Money.zero(),
    });

    expect(position.utilizationPercent).toBe(0);
  });
});
