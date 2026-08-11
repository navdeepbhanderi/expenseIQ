/**
 * Calendar boundaries, computed in the user's timezone rather than in UTC.
 *
 * **The bug this exists to kill.**
 *
 * `startOfMonth` was `new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))`.
 * India is UTC+5:30, so between 00:00 and 05:30 IST on the first of any month,
 * `new Date()` is still in the previous month in UTC — and every "this month"
 * figure in the product silently reported the month before. Dashboard spend,
 * budgets, spend limits, allowance crediting and the reports all inherited it,
 * for five and a half hours out of every month, with nothing on screen to
 * suggest anything was wrong.
 *
 * **Why one implementation is safe for both kinds of input.**
 *
 * These helpers are applied to two different things: an instant ("now"), and a
 * stored date-only column, which Postgres hands back as UTC midnight. Taking
 * the *local* calendar date is right for both — UTC midnight on the 5th is
 * 05:30 IST on the 5th, still the 5th — so a stored date is unaffected while a
 * live instant is finally correct. That is what makes this a drop-in
 * replacement rather than a migration.
 *
 * Boundaries are returned as UTC midnight of the local calendar date, which is
 * the form the date-only columns are compared against.
 */

/**
 * India-first, and deployed nowhere else yet.
 *
 * Kept as one named constant rather than scattered string literals so that
 * when profiles gain a real timezone field there is exactly one place that has
 * to start reading it.
 */
export const APP_TIMEZONE = 'Asia/Kolkata';

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

/** The calendar date at this instant, in the given timezone. */
export function localParts(
  now: Date = new Date(),
  timezone: string = APP_TIMEZONE,
): LocalDateParts {
  // en-CA formats as YYYY-MM-DD, so the parts come out without reassembling
  // named months or worrying about locale ordering.
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number) as [number, number, number];

  return { year, month, day };
}

/** Today in the given timezone, as YYYY-MM-DD. */
export function todayIn(
  timezone: string = APP_TIMEZONE,
  now: Date = new Date(),
): string {
  const { year, month, day } = localParts(now, timezone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** UTC midnight of the local calendar day. */
export function startOfDay(
  date: Date = new Date(),
  timezone: string = APP_TIMEZONE,
): Date {
  const { year, month, day } = localParts(date, timezone);
  return new Date(Date.UTC(year, month - 1, day));
}

/** UTC midnight of the first day of the local calendar month. */
export function startOfMonth(
  date: Date = new Date(),
  timezone: string = APP_TIMEZONE,
): Date {
  const { year, month } = localParts(date, timezone);
  return new Date(Date.UTC(year, month - 1, 1));
}

/**
 * Steps whole months from a month boundary.
 *
 * Takes no timezone: the input is already a boundary produced above, so it is
 * UTC midnight on the first and calendar arithmetic on it is unambiguous.
 */
export function addMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

/** YYYY-MM, the key budgets and reports are stored under. */
export function monthKey(
  date: Date = new Date(),
  timezone: string = APP_TIMEZONE,
): string {
  const { year, month } = localParts(date, timezone);
  return `${year}-${pad(month)}`;
}

/** Whole days between two instants, by local calendar day. */
export function daysBetween(
  earlier: Date,
  later: Date,
  timezone: string = APP_TIMEZONE,
): number {
  return Math.round(
    (startOfDay(later, timezone).getTime() -
      startOfDay(earlier, timezone).getTime()) /
      86_400_000,
  );
}

/** Whole months between two month boundaries. */
export function monthsBetween(earlier: Date, later: Date): number {
  return (
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    (later.getUTCMonth() - earlier.getUTCMonth())
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
