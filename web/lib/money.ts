/**
 * Money formatting, in exactly one place.
 *
 * The API speaks integer paise in a `Minor`-suffixed field and never a float,
 * for the reason every money system eventually learns: 0.1 + 0.2 is not 0.3.
 * The client keeps that discipline — paise stay integers until the moment
 * they become a string for a human, and that moment is here.
 *
 * Any component doing its own `/ 100` has just reintroduced the bug this
 * module exists to prevent.
 */

/** The API's money shape, returned by every endpoint that talks about value. */
export interface Money {
  amountMinor: number;
  currency: string;
}

/**
 * Indian digit grouping — ₹1,24,860, not ₹124,860.
 *
 * `en-IN` gives the lakh/crore grouping natively, which is why this defers to
 * Intl instead of grouping by threes and hoping. An Indian user reading
 * "1,24,860" parses it instantly; "124,860" makes them count digits.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, fractions: boolean): Intl.NumberFormat {
  const key = `${currency}:${fractions}`;
  let formatter = formatters.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: fractions ? 2 : 0,
      maximumFractionDigits: fractions ? 2 : 0,
    });
    formatters.set(key, formatter);
  }

  return formatter;
}

export interface FormatOptions {
  /**
   * Show paise. Off by default because the design shows whole rupees
   * everywhere it displays a total — ₹64,210, not ₹64,210.00. Turn it on for
   * inputs and anywhere a user is reconciling against a statement.
   */
  paise?: boolean;
  /** Prefix a sign. Used by deltas, where direction is the whole point. */
  signed?: boolean;
}

export function formatMoney(
  money: Money | null | undefined,
  options: FormatOptions = {},
): string {
  if (!money) return "—";

  return formatMinor(money.amountMinor, money.currency, options);
}

export function formatMinor(
  amountMinor: number,
  currency = "INR",
  options: FormatOptions = {},
): string {
  const { paise = false, signed = false } = options;

  const rupees = amountMinor / 100;
  const formatted = formatterFor(currency, paise).format(Math.abs(rupees));

  if (signed && amountMinor !== 0) {
    return `${amountMinor > 0 ? "+" : "−"}${formatted}`;
  }

  // Intl already renders a minus for negatives; the explicit branch above
  // only applies when the caller wants a leading + as well.
  return rupees < 0 ? `−${formatted}` : formatted;
}

/**
 * Compact form for tight spaces — ₹34.2L, ₹1.2Cr.
 *
 * The design uses this for net worth (2a shows "₹−34.2L"), where the exact
 * rupee is noise and the magnitude is the message. Lakh and crore, because
 * that is how the number would be said aloud in the app's market.
 */
export function formatCompact(
  amountMinor: number,
  currency = "INR",
): string {
  const rupees = Math.abs(amountMinor) / 100;
  const sign = amountMinor < 0 ? "−" : "";
  const symbol = currency === "INR" ? "₹" : "";

  if (rupees >= 1_00_00_000) {
    return `${sign}${symbol}${trim(rupees / 1_00_00_000)}Cr`;
  }
  if (rupees >= 1_00_000) {
    return `${sign}${symbol}${trim(rupees / 1_00_000)}L`;
  }
  if (rupees >= 1_000) {
    return `${sign}${symbol}${trim(rupees / 1_000)}K`;
  }

  return `${sign}${symbol}${Math.round(rupees)}`;
}

function trim(value: number): string {
  // One decimal, but no trailing ".0" — "₹5L" reads better than "₹5.0L".
  return value.toFixed(1).replace(/\.0$/, "");
}

/**
 * Parses what a human typed into paise.
 *
 * Accepts "300", "₹300", "1,24,860", "300.50", "3 lakh", "1.5cr", "5k" —
 * because people type amounts the way they say them, and rejecting "2 lakh"
 * as invalid input is the app being pedantic at the user's expense.
 *
 * Returns null rather than 0 for unparseable input: 0 is a legitimate amount
 * and must not be how failure is spelled.
 */
export function parseAmountToMinor(input: string): number | null {
  const cleaned = input.trim().toLowerCase().replace(/[₹,\s]/g, "");
  if (!cleaned) return null;

  const match = /^(\d+(?:\.\d+)?)(k|l|lakh|lac|cr|crore)?$/.exec(cleaned);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  const multiplier = match[2]
    ? { k: 1_000, l: 1_00_000, lakh: 1_00_000, lac: 1_00_000, cr: 1_00_00_000, crore: 1_00_00_000 }[
        match[2]
      ]!
    : 1;

  // Rounded, not truncated: 0.1 * 100 is 10.000000000000002 in binary float,
  // and truncating that to an integer silently loses a paisa.
  return Math.round(value * multiplier * 100);
}

/** Percentage helper that refuses to divide by zero. */
export function percentOf(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

/**
 * Seconds left on an undo token, derived from the server's `expiresAt`.
 *
 * The server sends an instant rather than a duration, and that is the safer
 * contract: a slow response would otherwise hand the user a full ten seconds
 * that the server has already started counting down. Floors at zero so a
 * clock skew cannot produce a negative countdown.
 */
export function undoSecondsLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}
