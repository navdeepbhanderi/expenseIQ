/**
 * Period boundaries for the Month / Quarter / Year control in design 6c.
 *
 * All UTC and all half-open [from, to) - the end is exclusive. Inclusive end
 * dates are where off-by-one bugs live: "up to 31 August" has to mean up to
 * the last millisecond of the 31st, and every caller gets that subtly wrong
 * in a different way. A half-open range composes correctly and the previous
 * period is simply the one that ends where this one starts.
 */

export type PeriodKind = 'month' | 'quarter' | 'year';

export interface PeriodRange {
  kind: PeriodKind;
  from: Date;
  /** Exclusive. */
  to: Date;
  /** Human-readable, for the comparison caption: "August 2026", "Q3 2026". */
  label: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function currentPeriod(
  kind: PeriodKind,
  asOf = new Date(),
): PeriodRange {
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();

  switch (kind) {
    case 'month':
      return {
        kind,
        from: utc(year, month, 1),
        to: utc(year, month + 1, 1),
        label: `${MONTH_NAMES[month] ?? ''} ${year}`,
      };

    case 'quarter': {
      const firstMonthOfQuarter = Math.floor(month / 3) * 3;
      return {
        kind,
        from: utc(year, firstMonthOfQuarter, 1),
        to: utc(year, firstMonthOfQuarter + 3, 1),
        label: `Q${Math.floor(month / 3) + 1} ${year}`,
      };
    }

    case 'year':
      return {
        kind,
        from: utc(year, 0, 1),
        to: utc(year + 1, 0, 1),
        label: String(year),
      };
  }
}

/**
 * The period immediately before this one.
 *
 * Derived by stepping the *start* back by one unit rather than by subtracting
 * the elapsed duration. Months and quarters have unequal lengths, so
 * subtracting "31 days" from March lands in the middle of February and the
 * comparison silently compares mismatched windows.
 */
export function previousPeriod(period: PeriodRange): PeriodRange {
  const year = period.from.getUTCFullYear();
  const month = period.from.getUTCMonth();

  switch (period.kind) {
    case 'month':
      return currentPeriod('month', utc(year, month - 1, 1));
    case 'quarter':
      return currentPeriod('quarter', utc(year, month - 3, 1));
    case 'year':
      return currentPeriod('year', utc(year - 1, 0, 1));
  }
}

/**
 * Days in the range, for per-day averages.
 *
 * Capped at today for a period still in progress: dividing August's spend by
 * 31 on the 5th reports a daily average six times too low, which is worse
 * than useless on a dashboard someone checks nightly.
 */
export function elapsedDays(period: PeriodRange, asOf = new Date()): number {
  const end = Math.min(period.to.getTime(), asOf.getTime());
  const days = Math.ceil((end - period.from.getTime()) / 86_400_000);
  return Math.max(1, days);
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}
