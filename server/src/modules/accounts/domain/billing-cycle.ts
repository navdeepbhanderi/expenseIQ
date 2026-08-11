import { Money } from '@/common/money/money';

/**
 * Credit-card statement and due dates.
 *
 * The account stores only two day-of-month integers. Turning those into real
 * dates is where the bugs live, and the feature spec calls out both of them:
 *
 *   1. A due day numerically *before* the statement day belongs to the
 *      following month. Statement on the 28th with payment due on the 12th
 *      means 28 Jul → 12 Aug, not 12 Jul. Design 2d shows exactly this.
 *
 *   2. A statement day of 29, 30 or 31 doesn't exist in every month. It
 *      clamps to the last day - 31 Jan, then 28 Feb (29 in a leap year),
 *      then 31 Mar. It must not silently roll into the next month, which is
 *      what naive `new Date(y, m, 31)` arithmetic does.
 *
 * Everything here is UTC. Billing days are calendar facts, not instants, and
 * mixing local time in makes the answer depend on the server's timezone.
 */

export interface BillingCycleInput {
  statementDay: number;
  dueDay: number;
  /** Defaults to now. Injectable so tests aren't time-dependent. */
  asOf?: Date;
}

export interface BillingCycle {
  /** The statement that generated the payment currently owed. */
  lastStatementDate: Date;
  nextStatementDate: Date;
  /** When the last statement's balance must be paid. */
  dueDate: Date;
  nextDueDate: Date;
  /** Negative once overdue - design 2f renders "−2d · Overdue". */
  daysUntilDue: number;
  isOverdue: boolean;
}

export class BillingCycleError extends Error {}

export function computeBillingCycle(input: BillingCycleInput): BillingCycle {
  const { statementDay, dueDay } = input;
  assertDayOfMonth(statementDay, 'statementDay');
  assertDayOfMonth(dueDay, 'dueDay');

  const asOf = startOfUtcDay(input.asOf ?? new Date());

  const lastStatementDate = mostRecentOccurrence(statementDay, asOf);
  const nextStatementDate = addMonthsClamped(
    lastStatementDate,
    statementDay,
    1,
  );

  const dueDate = dueDateFor(lastStatementDate, statementDay, dueDay);
  const nextDueDate = dueDateFor(nextStatementDate, statementDay, dueDay);

  const daysUntilDue = differenceInDays(dueDate, asOf);

  return {
    lastStatementDate,
    nextStatementDate,
    dueDate,
    nextDueDate,
    daysUntilDue,
    isOverdue: daysUntilDue < 0,
  };
}

/**
 * The payment due for a given statement.
 *
 * Two separate reasons to roll into the next month, and both are needed:
 *
 *   - The configured due day is at or before the configured statement day.
 *     Statement 28th, due 12th → the 12th of the following month.
 *
 *   - Clamping collapsed the two onto the same date. Statement on the 28th
 *     with payment due on the 30th looks fine for eleven months of the year,
 *     but in a non-leap February the 30th clamps back to the 28th and the
 *     bill would appear due the very day it was generated. Comparing the
 *     configured days alone does not catch this; the resulting dates must be
 *     compared too.
 */
function dueDateFor(
  statementDate: Date,
  statementDay: number,
  dueDay: number,
): Date {
  // Equal days roll forward - a balance cannot fall due the same instant the
  // statement that created it is generated.
  const monthsAhead = dueDay > statementDay ? 0 : 1;
  const candidate = addMonthsClamped(statementDate, dueDay, monthsAhead);

  if (candidate.getTime() > statementDate.getTime()) {
    return candidate;
  }

  return addMonthsClamped(statementDate, dueDay, monthsAhead + 1);
}

/** The most recent date with this day-of-month, on or before `asOf`. */
function mostRecentOccurrence(day: number, asOf: Date): Date {
  const thisMonth = clampToMonth(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    day,
  );

  if (thisMonth.getTime() <= asOf.getTime()) {
    return thisMonth;
  }

  return clampToMonth(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1, day);
}

/**
 * Moves `months` forward from the month of `from`, landing on `day` clamped to
 * that month's length. Anchored to the requested day rather than the clamped
 * one, so 31 Jan → 28 Feb → 31 Mar rather than degrading to the 28th forever.
 */
function addMonthsClamped(from: Date, day: number, months: number): Date {
  return clampToMonth(from.getUTCFullYear(), from.getUTCMonth() + months, day);
}

/** Day 0 of the following month is the last day of this one. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function clampToMonth(year: number, month: number, day: number): Date {
  // Normalise first so a month of −1 or 12 rolls the year correctly.
  const anchor = new Date(Date.UTC(year, month, 1));
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  return new Date(Date.UTC(y, m, Math.min(day, lastDayOfMonth(y, m))));
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function differenceInDays(later: Date, earlier: Date): number {
  return Math.round(
    (later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000),
  );
}

function assertDayOfMonth(day: number, field: string): void {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new BillingCycleError(
      `${field} must be an integer between 1 and 31, got ${day}`,
    );
  }
}

// ─── Card position ───────────────────────────────────────────────────────────

export interface CardPositionInput {
  outstanding: Money;
  creditLimit: Money;
  /** Percentage of the balance the issuer requires. Typically 5. */
  minDuePercent?: number;
}

export interface CardPosition {
  outstanding: Money;
  creditLimit: Money;
  /** Design 2d: "₹1,76,520 available". */
  available: Money;
  /** Design 2d: "min ₹1,180". */
  minimumDue: Money;
  /** Design 2d: "12% of ₹2,00,000 limit used". */
  utilizationPercent: number;
  /**
   * The 30% line the design flags in red. It's a real financial-literacy
   * signal - credit scoring models penalise utilisation above it - not an
   * arbitrary threshold.
   */
  isHighUtilization: boolean;
}

/** Issuers floor the minimum payment; below this they ask for the lot. */
export const MINIMUM_DUE_FLOOR = Money.fromMajor(100);
export const HIGH_UTILIZATION_THRESHOLD = 30;

export function computeCardPosition(input: CardPositionInput): CardPosition {
  const { outstanding, creditLimit } = input;
  const percent = input.minDuePercent ?? 5;

  const available = creditLimit.subtract(outstanding);

  return {
    outstanding,
    creditLimit,
    // Clamped at zero: an over-limit card would otherwise report negative
    // available credit, which reads as a data error rather than a warning.
    available: available.isNegative
      ? Money.zero(available.currency)
      : available,
    minimumDue: computeMinimumDue(outstanding, percent),
    utilizationPercent: outstanding.ratioOf(creditLimit),
    isHighUtilization:
      outstanding.ratioOf(creditLimit) > HIGH_UTILIZATION_THRESHOLD,
  };
}

function computeMinimumDue(outstanding: Money, percent: number): Money {
  if (!outstanding.isPositive) {
    return Money.zero(outstanding.currency);
  }

  // Rounded up: a minimum payment rounded *down* leaves a few paise
  // outstanding and can trigger a late fee on a bill the user believes settled.
  const proportional = outstanding.percentOf(percent, 'ceil');

  // Never ask for more than is owed on a small balance.
  if (outstanding.lessThan(MINIMUM_DUE_FLOOR)) {
    return outstanding;
  }

  return proportional.lessThan(MINIMUM_DUE_FLOOR)
    ? MINIMUM_DUE_FLOOR
    : proportional;
}
