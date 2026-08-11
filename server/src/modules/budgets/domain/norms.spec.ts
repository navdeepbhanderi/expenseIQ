import { Money } from '@/common/money/money';
import {
  APPROACHING_THRESHOLD,
  compareToNorm,
  compareToPrevious,
  computeBudgetStatus,
  computeCategoryNorm,
  MIN_MONTHS_FOR_NORM,
} from './norms';

const rupees = (...values: number[]): Money[] =>
  values.map((v) => Money.fromMajor(v));

describe('computeCategoryNorm', () => {
  it('takes the median of an odd-length history', () => {
    const norm = computeCategoryNorm(rupees(20_000, 25_000, 30_000));
    expect(norm.usual.toMajor()).toBe(25_000);
    expect(norm.isReliable).toBe(true);
  });

  it('averages the middle pair of an even-length history', () => {
    const norm = computeCategoryNorm(rupees(20_000, 24_000, 26_000, 30_000));
    expect(norm.usual.toMajor()).toBe(25_000);
  });

  it('ignores a one-off spike, which a mean would not', () => {
    // A wedding month or an annual premium must not redefine "usual" for the
    // rest of the year - every later month would read as "below normal" and
    // the nudge would stop meaning anything.
    const spiky = rupees(25_000, 24_000, 26_000, 25_000, 3_00_000);
    const norm = computeCategoryNorm(spiky);

    const mean =
      spiky.reduce((a, b) => a.add(b), Money.zero()).toMajor() / spiky.length;

    expect(norm.usual.toMajor()).toBe(25_000);
    expect(mean).toBeGreaterThan(70_000);
  });

  it('counts a skipped month as a real zero', () => {
    const norm = computeCategoryNorm(rupees(0, 0, 20_000, 30_000, 40_000));
    expect(norm.usual.toMajor()).toBe(20_000);
  });

  it('refuses to call two months a norm', () => {
    expect(computeCategoryNorm(rupees(25_000, 24_000)).isReliable).toBe(false);
    expect(computeCategoryNorm(rupees(25_000, 24_000, 26_000)).isReliable).toBe(
      true,
    );
    expect(MIN_MONTHS_FOR_NORM).toBe(3);
  });

  it('handles an empty history', () => {
    const norm = computeCategoryNorm([]);
    expect(norm.usual.isZero).toBe(true);
    expect(norm.isReliable).toBe(false);
  });
});

describe('compareToPrevious', () => {
  it('reports a fall as design 6f renders it', () => {
    // "↓ 8% vs July"
    const result = compareToPrevious(
      Money.fromMajor(64_210),
      Money.fromMajor(69_800),
    );

    expect(result.direction).toBe('down');
    expect(result.deltaPercent).toBeCloseTo(-8.01, 1);
  });

  it('reports a rise', () => {
    const result = compareToPrevious(
      Money.fromMajor(70_000),
      Money.fromMajor(50_000),
    );
    expect(result.direction).toBe('up');
    expect(result.deltaPercent).toBe(40);
  });

  it('reports no change as flat', () => {
    const result = compareToPrevious(
      Money.fromMajor(50_000),
      Money.fromMajor(50_000),
    );
    expect(result.direction).toBe('flat');
    expect(result.deltaPercent).toBe(0);
  });

  it('returns null rather than Infinity when there is no baseline', () => {
    // ₹0 → ₹500 is not "+∞%". The UI needs to say "new", not render a
    // broken number.
    const result = compareToPrevious(Money.fromMajor(500), Money.zero());
    expect(result.deltaPercent).toBeNull();
    expect(result.direction).toBe('up');
  });
});

describe('computeBudgetStatus', () => {
  it('reproduces design 2a', () => {
    // "₹15,790 left of ₹80,000 budget", spend ₹64,210.
    const status = computeBudgetStatus(
      Money.fromMajor(64_210),
      Money.fromMajor(80_000),
    );

    expect(status.remaining.toMajor()).toBe(15_790);
    expect(status.usedPercent).toBeCloseTo(80.26, 2);
    expect(status.isOver).toBe(false);
  });

  it('flags the nudge threshold the spec sets at 80%', () => {
    const status = computeBudgetStatus(
      Money.fromMajor(80_000),
      Money.fromMajor(1_00_000),
    );
    expect(status.isApproaching).toBe(true);
    expect(APPROACHING_THRESHOLD).toBe(80);
  });

  it('reports overspend as a percentage above 100, not negative remaining', () => {
    // Design 6e shows "Over budget 112%". "−₹4,210 left" is a contradiction.
    const status = computeBudgetStatus(
      Money.fromMajor(1_12_000),
      Money.fromMajor(1_00_000),
    );

    expect(status.isOver).toBe(true);
    expect(status.usedPercent).toBe(112);
    expect(status.remaining.isZero).toBe(true);
    expect(status.remaining.isNegative).toBe(false);
  });

  it('stops calling it "approaching" once it is over', () => {
    const status = computeBudgetStatus(
      Money.fromMajor(1_20_000),
      Money.fromMajor(1_00_000),
    );
    expect(status.isApproaching).toBe(false);
    expect(status.isOver).toBe(true);
  });

  it('treats a zero budget as 0% rather than dividing by zero', () => {
    const status = computeBudgetStatus(Money.fromMajor(5_000), Money.zero());
    expect(status.usedPercent).toBe(0);
    expect(status.isOver).toBe(true);
  });
});

describe('compareToNorm', () => {
  it('reproduces design 3e', () => {
    // "74% of your usual ₹25,000 on groceries"
    const norm = computeCategoryNorm(rupees(25_000, 25_000, 25_000));
    const result = compareToNorm(Money.fromMajor(18_720), norm);

    expect(result).not.toBeNull();
    expect(result?.percentOfUsual).toBeCloseTo(74.88, 1);
    expect(result?.usual.toMajor()).toBe(25_000);
  });

  it('stays silent when there is not enough history', () => {
    // Better no comparison than a confident one built on a single month.
    const norm = computeCategoryNorm(rupees(25_000));
    expect(compareToNorm(Money.fromMajor(18_720), norm)).toBeNull();
  });

  it('stays silent when the norm is zero', () => {
    const norm = computeCategoryNorm(rupees(0, 0, 0));
    expect(compareToNorm(Money.fromMajor(500), norm)).toBeNull();
  });
});
