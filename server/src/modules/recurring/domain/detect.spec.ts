import { Cadence } from '@prisma/client';
import {
  detectRecurrences,
  MIN_CONFIDENCE,
  MIN_OCCURRENCES,
  type HistoricalTransaction,
} from './detect';

let sequence = 0;

/** Builds a series of payments `intervalDays` apart. */
function series(options: {
  merchantId?: string | null;
  categoryId?: string | null;
  accountId?: string | null;
  start: string;
  intervalDays: number | number[];
  count: number;
  amountMajor: number | number[];
}): HistoricalTransaction[] {
  const rows: HistoricalTransaction[] = [];
  let date = new Date(`${options.start}T00:00:00.000Z`);

  for (let i = 0; i < options.count; i += 1) {
    const amount = Array.isArray(options.amountMajor)
      ? (options.amountMajor[i % options.amountMajor.length] ?? 0)
      : options.amountMajor;

    rows.push({
      id: `tx-${(sequence += 1)}`,
      merchantId: options.merchantId ?? null,
      merchantName: options.merchantId ? 'Test merchant' : null,
      categoryId: options.categoryId ?? null,
      accountId: options.accountId ?? null,
      amountMinor: BigInt(Math.round(amount * 100)),
      date,
    });

    const step = Array.isArray(options.intervalDays)
      ? (options.intervalDays[i % options.intervalDays.length] ?? 30)
      : options.intervalDays;
    date = new Date(date.getTime() + step * 86_400_000);
  }

  return rows;
}

describe('detectRecurrences', () => {
  it('finds a monthly subscription', () => {
    const [found] = detectRecurrences(
      series({
        merchantId: 'netflix',
        start: '2026-02-01',
        intervalDays: 30,
        count: 6,
        amountMajor: 649,
      }),
    );

    expect(found?.cadence).toBe(Cadence.MONTHLY);
    expect(found?.occurrences).toBe(6);
    expect(found?.typicalAmount.toMajor()).toBe(649);
    expect(found?.confidence).toBeGreaterThan(0.8);
  });

  it('finds weekly, quarterly and yearly cadences', () => {
    const cases: [number, Cadence][] = [
      [7, Cadence.WEEKLY],
      [91, Cadence.QUARTERLY],
      [365, Cadence.YEARLY],
    ];

    for (const [intervalDays, cadence] of cases) {
      const [found] = detectRecurrences(
        series({
          merchantId: `m-${intervalDays}`,
          start: '2020-01-01',
          intervalDays,
          count: 5,
          amountMajor: 1000,
        }),
      );
      expect(found?.cadence).toBe(cadence);
    }
  });

  it('accepts a bill whose amount changes every month', () => {
    // An electricity bill is obviously recurring and never the same twice.
    // Design 2e shows exactly this: "Adani Electricity · Utilities · recurring".
    const [found] = detectRecurrences(
      series({
        merchantId: 'adani',
        start: '2026-02-03',
        intervalDays: 30,
        count: 6,
        amountMajor: [2410, 1890, 3120, 2650, 2010, 2880],
      }),
    );

    expect(found?.cadence).toBe(Cadence.MONTHLY);
    expect(found?.amountVariancePercent).toBeGreaterThan(10);
    expect(found?.confidence).toBeGreaterThan(MIN_CONFIDENCE);
  });

  it('tolerates the drift real monthly bills have', () => {
    // Business days, weekends and 28-to-31-day months mean consecutive gaps of
    // 28 and 33 are the same subscription, not two different ones.
    const [found] = detectRecurrences(
      series({
        merchantId: 'jio',
        start: '2026-01-05',
        intervalDays: [28, 33, 29, 31, 30],
        count: 6,
        amountMajor: 399,
      }),
    );

    expect(found?.cadence).toBe(Cadence.MONTHLY);
  });

  it('is not derailed by one missed month', () => {
    // A double-length gap would drag a *mean* interval towards quarterly and
    // reclassify the subscription. The median ignores it.
    const [found] = detectRecurrences(
      series({
        merchantId: 'spotify',
        start: '2026-01-01',
        intervalDays: [30, 30, 60, 30, 30],
        count: 6,
        amountMajor: 119,
      }),
    );

    expect(found?.cadence).toBe(Cadence.MONTHLY);
  });

  it('ignores two occurrences — a coincidence looks like a pattern', () => {
    expect(
      detectRecurrences(
        series({
          merchantId: 'once',
          start: '2026-01-01',
          intervalDays: 30,
          count: 2,
          amountMajor: 500,
        }),
      ),
    ).toEqual([]);

    expect(MIN_OCCURRENCES).toBe(3);
  });

  it('ignores irregular spending that merely happens often', () => {
    // Eating out four times at random intervals is not a subscription.
    const [found] = detectRecurrences(
      series({
        merchantId: 'swiggy',
        start: '2026-01-01',
        intervalDays: [3, 19, 2, 41, 7],
        count: 6,
        amountMajor: 480,
      }),
    );

    expect(found).toBeUndefined();
  });

  it('predicts the next occurrence', () => {
    const [found] = detectRecurrences(
      series({
        merchantId: 'rent',
        start: '2026-01-01',
        intervalDays: 30,
        count: 5,
        amountMajor: 25_000,
      }),
    );

    // Five payments 30 days apart from 1 Jan land on 1 May, so the next is
    // 30 days later. Note this is a fixed 30-day step, not "the 1st of the
    // month" — a real monthly bill drifts, which is what the tolerance is for.
    expect(found?.nextExpected.toISOString().slice(0, 10)).toBe('2026-05-31');
  });

  it('groups by category and account when there is no merchant', () => {
    // Rent by standing instruction often carries no merchant at all.
    const [found] = detectRecurrences(
      series({
        merchantId: null,
        categoryId: 'rent-category',
        accountId: 'sbi',
        start: '2026-01-01',
        intervalDays: 30,
        count: 5,
        amountMajor: 25_000,
      }),
    );

    expect(found?.cadence).toBe(Cadence.MONTHLY);
    expect(found?.merchantId).toBeNull();
    expect(found?.categoryId).toBe('rent-category');
  });

  it('keeps different payees apart', () => {
    const found = detectRecurrences([
      ...series({
        merchantId: 'netflix',
        start: '2026-01-01',
        intervalDays: 30,
        count: 5,
        amountMajor: 649,
      }),
      ...series({
        merchantId: 'spotify',
        start: '2026-01-15',
        intervalDays: 30,
        count: 5,
        amountMajor: 119,
      }),
    ]);

    expect(found).toHaveLength(2);
    expect(new Set(found.map((r) => r.merchantId))).toEqual(
      new Set(['netflix', 'spotify']),
    );
  });

  it('ranks the most confident first', () => {
    const found = detectRecurrences([
      ...series({
        merchantId: 'tight',
        start: '2026-01-01',
        intervalDays: 30,
        count: 8,
        amountMajor: 500,
      }),
      ...series({
        merchantId: 'moderate',
        start: '2026-01-01',
        intervalDays: [28, 32, 29, 31],
        count: 6,
        amountMajor: 500,
      }),
    ]);

    expect(found[0]?.merchantId).toBe('tight');
    expect(found[0]!.confidence).toBeGreaterThan(found[1]!.confidence);
  });

  it('uses the median amount, ignoring one unusual bill', () => {
    const [found] = detectRecurrences(
      series({
        merchantId: 'gym',
        start: '2026-01-01',
        intervalDays: 30,
        count: 5,
        amountMajor: [1500, 1500, 15_000, 1500, 1500],
      }),
    );

    expect(found?.typicalAmount.toMajor()).toBe(1500);
  });

  it('produces a stable signature across runs', () => {
    // A dismissed suggestion has to stay dismissed, which needs an identity
    // that survives recomputation.
    const rows = series({
      merchantId: 'netflix',
      start: '2026-01-01',
      intervalDays: 30,
      count: 5,
      amountMajor: 649,
    });

    expect(detectRecurrences(rows)[0]?.signature).toBe(
      detectRecurrences([...rows].reverse())[0]?.signature,
    );
  });

  it('handles empty input', () => {
    expect(detectRecurrences([])).toEqual([]);
  });
});
