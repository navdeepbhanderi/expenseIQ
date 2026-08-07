import { currentPeriod, elapsedDays, previousPeriod } from './periods';

const iso = (date: Date): string => date.toISOString().slice(0, 10);

describe('currentPeriod', () => {
  const asOf = new Date('2026-08-05T12:00:00.000Z');

  it('bounds a month', () => {
    const period = currentPeriod('month', asOf);
    expect(iso(period.from)).toBe('2026-08-01');
    expect(iso(period.to)).toBe('2026-09-01');
    expect(period.label).toBe('August 2026');
  });

  it('bounds the quarter containing the date', () => {
    const period = currentPeriod('quarter', asOf);
    expect(iso(period.from)).toBe('2026-07-01');
    expect(iso(period.to)).toBe('2026-10-01');
    expect(period.label).toBe('Q3 2026');
  });

  it('bounds a year', () => {
    const period = currentPeriod('year', asOf);
    expect(iso(period.from)).toBe('2026-01-01');
    expect(iso(period.to)).toBe('2027-01-01');
    expect(period.label).toBe('2026');
  });

  it('puts every month in the right quarter', () => {
    const expected = [
      'Q1',
      'Q1',
      'Q1',
      'Q2',
      'Q2',
      'Q2',
      'Q3',
      'Q3',
      'Q3',
      'Q4',
      'Q4',
      'Q4',
    ];

    for (let month = 0; month < 12; month += 1) {
      const period = currentPeriod(
        'quarter',
        new Date(Date.UTC(2026, month, 15)),
      );
      expect(period.label.startsWith(expected[month] ?? '')).toBe(true);
    }
  });

  it('uses a half-open range so periods tile without gaps or overlap', () => {
    const august = currentPeriod('month', new Date(Date.UTC(2026, 7, 15)));
    const september = currentPeriod('month', new Date(Date.UTC(2026, 8, 15)));

    expect(august.to.getTime()).toBe(september.from.getTime());
  });
});

describe('previousPeriod', () => {
  it('steps back one month, crossing a year boundary', () => {
    const january = currentPeriod(
      'month',
      new Date('2026-01-15T00:00:00.000Z'),
    );
    const december = previousPeriod(january);

    expect(iso(december.from)).toBe('2025-12-01');
    expect(december.label).toBe('December 2025');
  });

  it('steps back a whole month, not a fixed number of days', () => {
    // Subtracting "31 days" from March lands mid-February and silently
    // compares mismatched windows.
    const march = currentPeriod('month', new Date('2026-03-15T00:00:00.000Z'));
    const february = previousPeriod(march);

    expect(iso(february.from)).toBe('2026-02-01');
    expect(iso(february.to)).toBe('2026-03-01');
  });

  it('steps back one quarter', () => {
    const q3 = currentPeriod('quarter', new Date('2026-08-05T00:00:00.000Z'));
    const q2 = previousPeriod(q3);

    expect(q2.label).toBe('Q2 2026');
    expect(iso(q2.from)).toBe('2026-04-01');
  });

  it('steps back across a year for Q1', () => {
    const q1 = currentPeriod('quarter', new Date('2026-02-05T00:00:00.000Z'));
    const q4 = previousPeriod(q1);

    expect(q4.label).toBe('Q4 2025');
  });

  it('steps back one year', () => {
    const year = currentPeriod('year', new Date('2026-08-05T00:00:00.000Z'));
    expect(previousPeriod(year).label).toBe('2025');
  });

  it('always abuts the period it precedes', () => {
    for (const kind of ['month', 'quarter', 'year'] as const) {
      const period = currentPeriod(kind, new Date('2026-08-05T00:00:00.000Z'));
      expect(previousPeriod(period).to.getTime()).toBe(period.from.getTime());
    }
  });
});

describe('elapsedDays', () => {
  it('counts only days that have happened, for a period in progress', () => {
    // Dividing August's spend by 31 on the 5th under-reports the daily
    // average six-fold.
    const august = currentPeriod('month', new Date('2026-08-05T00:00:00.000Z'));
    expect(elapsedDays(august, new Date('2026-08-05T12:00:00.000Z'))).toBe(5);
  });

  it('counts the whole period once it has passed', () => {
    const august = currentPeriod('month', new Date('2026-08-05T00:00:00.000Z'));
    expect(elapsedDays(august, new Date('2026-10-01T00:00:00.000Z'))).toBe(31);
  });

  it('never returns zero, so a per-day average cannot divide by it', () => {
    const august = currentPeriod('month', new Date('2026-08-01T00:00:00.000Z'));
    expect(elapsedDays(august, new Date('2026-08-01T00:00:00.000Z'))).toBe(1);
  });
});
