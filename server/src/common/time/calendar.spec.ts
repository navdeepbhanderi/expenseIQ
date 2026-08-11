import {
  addMonths,
  daysBetween,
  monthKey,
  monthsBetween,
  startOfDay,
  startOfMonth,
  todayIn,
} from './calendar';

/**
 * The window that mattered: 00:00–05:30 IST, when UTC is still on the previous
 * day - and, on the 1st, in the previous month.
 */
const IST_EARLY_HOURS = new Date('2026-08-31T19:30:00.000Z'); // 01:00 IST, 1 Sep
const MIDDAY = new Date('2026-08-15T09:00:00.000Z'); // 14:30 IST, 15 Aug

describe('startOfMonth', () => {
  it('uses the local month during the early hours of the 1st', () => {
    /*
     * The bug in one assertion. At 01:00 IST on 1 September the UTC date is
     * 31 August, so the UTC implementation answered 1 August - and every
     * "this month" total in the product was a month behind until 05:30.
     */
    expect(startOfMonth(IST_EARLY_HOURS).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(IST_EARLY_HOURS.getUTCMonth()).toBe(7); // August, as UTC saw it
  });

  it('agrees with UTC at any sane hour', () => {
    expect(startOfMonth(MIDDAY).toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('leaves a stored date-only value untouched', () => {
    /*
     * Postgres hands a `date` column back as UTC midnight. In IST that is
     * 05:30 the same morning - still the same calendar day - so applying the
     * timezone-aware version to stored dates changes nothing. That is what
     * makes this a drop-in replacement rather than a data migration.
     */
    const stored = new Date('2026-08-05T00:00:00.000Z');
    expect(startOfMonth(stored).toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('handles a year boundary', () => {
    // 00:30 IST on 1 January is 19:00 UTC on 31 December - a year out, not
    // just a month.
    const newYear = new Date('2025-12-31T19:00:00.000Z');
    expect(startOfMonth(newYear).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });
});

describe('startOfDay', () => {
  it('uses the local day late at night', () => {
    // 00:30 IST on 11 August is 19:00 UTC on the 10th.
    const lateNight = new Date('2026-08-10T19:00:00.000Z');
    expect(startOfDay(lateNight).toISOString()).toBe(
      '2026-08-11T00:00:00.000Z',
    );
  });

  it('leaves a stored date alone', () => {
    const stored = new Date('2026-08-05T00:00:00.000Z');
    expect(startOfDay(stored).toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });
});

describe('todayIn', () => {
  it('reports the local date', () => {
    expect(todayIn('Asia/Kolkata', IST_EARLY_HOURS)).toBe('2026-09-01');
  });

  it('differs from the UTC date inside the window', () => {
    expect(IST_EARLY_HOURS.toISOString().slice(0, 10)).toBe('2026-08-31');
  });
});

describe('monthKey', () => {
  it('keys by the local month', () => {
    expect(monthKey(IST_EARLY_HOURS)).toBe('2026-09');
    expect(monthKey(MIDDAY)).toBe('2026-08');
  });

  it('is what the allowance guard compares against', () => {
    // Credited at 00:30 IST on the 1st, a UTC key recorded the month before -
    // so the real first-of-month run saw no record and credited again.
    expect(monthKey(IST_EARLY_HOURS)).not.toBe(
      IST_EARLY_HOURS.toISOString().slice(0, 7),
    );
  });
});

describe('addMonths', () => {
  it('steps forward and back from a boundary', () => {
    const august = new Date('2026-08-01T00:00:00.000Z');
    expect(addMonths(august, 1).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(addMonths(august, -8).toISOString()).toBe(
      '2025-12-01T00:00:00.000Z',
    );
  });
});

describe('daysBetween and monthsBetween', () => {
  it('counts whole local days', () => {
    expect(
      daysBetween(
        new Date('2026-08-01T00:00:00Z'),
        new Date('2026-08-11T00:00:00Z'),
      ),
    ).toBe(10);
  });

  it('counts whole months across a year', () => {
    expect(
      monthsBetween(
        new Date('2025-11-01T00:00:00Z'),
        new Date('2026-02-01T00:00:00Z'),
      ),
    ).toBe(3);
  });
});
