import { Money } from '@/common/money/money';

/**
 * Spending norms and comparisons — the numbers the design states as plain
 * sentences and the specs never model.
 *
 *   design 3e: "74% of your usual ₹25,000 on groceries"
 *   design 6f: "↓ 8% vs July"
 *   design 6e: "Budget used 80%" / "Over budget 112%"
 */

export interface CategoryNorm {
  /** The "usual" figure. Median, not mean — see below. */
  usual: Money;
  /** How many months of history it was computed from. */
  sampleMonths: number;
  /**
   * False when there's too little history to say "usual" with a straight
   * face. The UI should stay quiet rather than tell someone their first
   * month is 100% of normal.
   */
  isReliable: boolean;
}

/** Fewer than this many months and "usual" is a guess, not an observation. */
export const MIN_MONTHS_FOR_NORM = 3;

/**
 * The typical monthly spend for a category.
 *
 * Median rather than mean, deliberately. Spending is spiky: one annual
 * insurance premium or a wedding month drags a mean upward for the rest of
 * the year, so every subsequent month reads as "below usual" and the nudge
 * stops meaning anything. The median ignores the outlier entirely.
 *
 * Months with no spending are included as zeros by the caller, because a
 * category you skipped is real information about how usual it is.
 */
export function computeCategoryNorm(
  monthlyTotals: readonly Money[],
): CategoryNorm {
  if (monthlyTotals.length === 0) {
    return { usual: Money.zero(), sampleMonths: 0, isReliable: false };
  }

  const sorted = [...monthlyTotals].sort((a, b) => a.minor - b.minor);
  const middle = Math.floor(sorted.length / 2);

  const usual =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? Money.zero())
      : (sorted[middle - 1] ?? Money.zero())
          .add(sorted[middle] ?? Money.zero())
          .multiply(0.5);

  return {
    usual,
    sampleMonths: monthlyTotals.length,
    isReliable: monthlyTotals.length >= MIN_MONTHS_FOR_NORM,
  };
}

export type Trend = 'up' | 'down' | 'flat';

export interface Comparison {
  current: Money;
  previous: Money;
  delta: Money;
  /** Null when the previous period was zero — see below. */
  deltaPercent: number | null;
  direction: Trend;
}

/**
 * Period-over-period comparison — design 6f's "↓ 8% vs July".
 *
 * `deltaPercent` is null rather than Infinity when the previous period was
 * zero. Going from ₹0 to ₹500 is not a "+∞% increase"; there is no meaningful
 * percentage, and the UI needs to render "new" rather than a broken number.
 */
export function compareToPrevious(current: Money, previous: Money): Comparison {
  const delta = current.subtract(previous);

  return {
    current,
    previous,
    delta,
    deltaPercent: previous.isZero
      ? null
      : (delta.minor / Math.abs(previous.minor)) * 100,
    direction: delta.isZero ? 'flat' : delta.isPositive ? 'up' : 'down',
  };
}

export interface BudgetStatus {
  budget: Money;
  spent: Money;
  remaining: Money;
  usedPercent: number;
  /** Past 80% — the spec's nudge threshold for child spend limits. */
  isApproaching: boolean;
  isOver: boolean;
}

/** The spec nudges a child at 80% of their limit rather than blocking. */
export const APPROACHING_THRESHOLD = 80;

export function computeBudgetStatus(spent: Money, budget: Money): BudgetStatus {
  const usedPercent = spent.ratioOf(budget);
  const remaining = budget.subtract(spent);

  return {
    budget,
    spent,
    // Clamped: design 2a says "₹15,790 left", and "−₹4,210 left" is a
    // contradiction. Overspend is expressed by isOver and a percent above 100.
    remaining: remaining.isNegative
      ? Money.zero(remaining.currency)
      : remaining,
    usedPercent,
    isApproaching: usedPercent >= APPROACHING_THRESHOLD && usedPercent < 100,
    isOver: spent.greaterThan(budget),
  };
}

/**
 * Where this month stands against the norm — design 3e's "74% of your usual".
 *
 * Returns null when there isn't enough history, so callers can't accidentally
 * render a confident-sounding comparison built on one month of data.
 */
export function compareToNorm(
  current: Money,
  norm: CategoryNorm,
): { percentOfUsual: number; usual: Money } | null {
  if (!norm.isReliable || norm.usual.isZero) {
    return null;
  }

  return { percentOfUsual: current.ratioOf(norm.usual), usual: norm.usual };
}
