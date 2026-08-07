import { Cadence } from '@prisma/client';
import { Money } from '@/common/money/money';

/**
 * Finds repeating payments in transaction history.
 *
 * Design 2e labels rows "Recurring" and "Auto-debit"; nothing in the specs
 * says how those are decided. This does it from dates alone, with no model
 * involved — periodicity is arithmetic, and asking an LLM whether four dates
 * are a month apart would be slower, costlier and less reliable than
 * subtracting them.
 *
 * The important judgement here: **amount variance does not disqualify a
 * recurrence.** An electricity bill is obviously recurring and is a different
 * number every month — design 2e shows exactly that ("Adani Electricity ·
 * Utilities · recurring"). So cadence is decided by the *dates*, and amount
 * stability is reported alongside as metadata rather than used as a filter.
 */

export interface HistoricalTransaction {
  id: string;
  merchantId: string | null;
  merchantName: string | null;
  categoryId: string | null;
  accountId: string | null;
  amountMinor: bigint;
  date: Date;
}

export interface DetectedRecurrence {
  /** Stable across runs, so a dismissed suggestion can stay dismissed. */
  signature: string;
  merchantId: string | null;
  merchantName: string | null;
  categoryId: string | null;
  accountId: string | null;
  cadence: Cadence;
  /** Median of observed amounts — robust to one unusual bill. */
  typicalAmount: Money;
  /** How much the amount moves. High is normal for utilities. */
  amountVariancePercent: number;
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  nextExpected: Date;
  /** 0–1. Below ~0.6 the pattern is too loose to suggest. */
  confidence: number;
  sampleTransactionIds: string[];
}

/** Below three occurrences, two coincidences look identical to a pattern. */
export const MIN_OCCURRENCES = 3;

/** Suggestions below this are noise and are not surfaced. */
export const MIN_CONFIDENCE = 0.6;

interface CadenceProfile {
  cadence: Cadence;
  days: number;
  /** How far an interval may drift and still count. */
  tolerance: number;
}

/**
 * Monthly tolerance is deliberately wide (±5 days).
 *
 * Real "monthly" bills land on business days, skip weekends, and sit in
 * months of 28–31 days, so consecutive intervals of 28 and 33 are the same
 * subscription rather than two different ones.
 */
const CADENCES: CadenceProfile[] = [
  { cadence: Cadence.WEEKLY, days: 7, tolerance: 2 },
  { cadence: Cadence.MONTHLY, days: 30.44, tolerance: 5 },
  { cadence: Cadence.QUARTERLY, days: 91.31, tolerance: 12 },
  { cadence: Cadence.YEARLY, days: 365.25, tolerance: 30 },
];

export function detectRecurrences(
  transactions: readonly HistoricalTransaction[],
): DetectedRecurrence[] {
  const groups = groupByPayee(transactions);
  const detected: DetectedRecurrence[] = [];

  for (const [signature, group] of groups) {
    if (group.length < MIN_OCCURRENCES) continue;

    const sorted = [...group].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    const intervals = intervalsInDays(sorted);
    const profile = matchCadence(intervals);

    if (!profile) continue;

    const amounts = sorted.map((t) => Money.fromBigInt(t.amountMinor));
    const typical = median(amounts);
    const last = sorted.at(-1)!;
    const first = sorted[0]!;

    const confidence = scoreConfidence(intervals, profile, sorted.length);
    if (confidence < MIN_CONFIDENCE) continue;

    detected.push({
      signature,
      merchantId: last.merchantId,
      merchantName: last.merchantName,
      categoryId: last.categoryId,
      accountId: last.accountId,
      cadence: profile.cadence,
      typicalAmount: typical,
      amountVariancePercent: variancePercent(amounts, typical),
      occurrences: sorted.length,
      firstSeen: first.date,
      lastSeen: last.date,
      nextExpected: addDays(last.date, Math.round(medianOf(intervals))),
      confidence,
      sampleTransactionIds: sorted.slice(-5).map((t) => t.id),
    });
  }

  return detected.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Groups by who was paid.
 *
 * Merchant when there is one, category+account otherwise. Rent paid by
 * standing instruction often carries no merchant at all, and grouping those
 * by category still finds the pattern.
 */
function groupByPayee(
  transactions: readonly HistoricalTransaction[],
): Map<string, HistoricalTransaction[]> {
  const groups = new Map<string, HistoricalTransaction[]>();

  for (const transaction of transactions) {
    const signature = transaction.merchantId
      ? `merchant:${transaction.merchantId}`
      : `category:${transaction.categoryId ?? 'none'}:account:${transaction.accountId ?? 'none'}`;

    const group = groups.get(signature) ?? [];
    group.push(transaction);
    groups.set(signature, group);
  }

  return groups;
}

function intervalsInDays(sorted: readonly HistoricalTransaction[]): number[] {
  const intervals: number[] = [];

  for (let i = 1; i < sorted.length; i += 1) {
    const days =
      (sorted[i]!.date.getTime() - sorted[i - 1]!.date.getTime()) / 86_400_000;
    intervals.push(days);
  }

  return intervals;
}

/**
 * Picks the cadence the median interval fits.
 *
 * Median rather than mean: one missed month produces a double-length gap that
 * would drag a mean halfway to the next cadence and reclassify a monthly
 * subscription as quarterly.
 */
function matchCadence(intervals: readonly number[]): CadenceProfile | null {
  if (intervals.length === 0) return null;

  const typical = medianOf(intervals);

  return (
    CADENCES.find(
      (profile) => Math.abs(typical - profile.days) <= profile.tolerance,
    ) ?? null
  );
}

/**
 * How confident we are this is a real schedule.
 *
 * Two independent signals, multiplied:
 *
 *   regularity — how tightly the intervals cluster around the cadence. A
 *                subscription billed on the 1st every month scores near 1;
 *                a coffee habit that happens roughly monthly does not.
 *   evidence   — how many occurrences. Three is the minimum to distinguish a
 *                pattern from a coincidence, and confidence keeps rising to
 *                six, after which more data adds little.
 *
 * Multiplied rather than averaged, so a tight pattern seen only three times
 * and a loose pattern seen twenty both stay appropriately uncertain.
 */
function scoreConfidence(
  intervals: readonly number[],
  profile: CadenceProfile,
  occurrences: number,
): number {
  const deviations = intervals.map(
    (interval) => Math.abs(interval - profile.days) / profile.tolerance,
  );

  // Median deviation, not mean — for the same reason the cadence itself uses
  // a median. One missed month produces a double-length gap whose deviation
  // is an order of magnitude larger than the rest; averaged in, it drags
  // regularity to zero and a perfectly good subscription stops being
  // detected because the user skipped a payment once.
  const typicalDeviation = medianOf(deviations);

  const regularity = Math.max(0, 1 - typicalDeviation);
  const evidence = Math.min(1, (occurrences - MIN_OCCURRENCES + 1) / 4);

  // Evidence is floored so a perfectly regular three-payment series still
  // clears the threshold — three exact months apart is a real subscription.
  return clamp01(regularity * (0.7 + 0.3 * evidence));
}

function median(amounts: readonly Money[]): Money {
  const sorted = [...amounts].sort((a, b) => a.minor - b.minor);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? Money.zero())
    : (sorted[middle - 1] ?? Money.zero())
        .add(sorted[middle] ?? Money.zero())
        .multiply(0.5);
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Mean absolute deviation from the typical amount, as a percentage. */
function variancePercent(amounts: readonly Money[], typical: Money): number {
  if (typical.isZero || amounts.length === 0) return 0;

  const total = amounts.reduce(
    (sum, amount) => sum + Math.abs(amount.minor - typical.minor),
    0,
  );

  return Number(
    ((total / amounts.length / Math.abs(typical.minor)) * 100).toPrecision(12),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
