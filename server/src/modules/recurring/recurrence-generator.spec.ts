import { Cadence } from '@prisma/client';
import { advance } from './recurrence-generator.service';

const iso = (d: Date): string => d.toISOString().slice(0, 10);

describe('advance', () => {
  it('steps a month on the calendar, not by 30 days', () => {
    // Adding 30 days drifts the date earlier every month until a "monthly"
    // bill falls twice in one month.
    expect(
      iso(advance(new Date('2026-01-15T00:00:00Z'), Cadence.MONTHLY)),
    ).toBe('2026-02-15');
    expect(
      iso(advance(new Date('2026-03-31T00:00:00Z'), Cadence.MONTHLY)),
    ).toBe('2026-04-30');
  });

  it('clamps into February and recovers afterwards', () => {
    const feb = advance(new Date('2026-01-31T00:00:00Z'), Cadence.MONTHLY);
    expect(iso(feb)).toBe('2026-02-28');

    // Anchored on the original day, so March returns to the 31st rather than
    // staying stuck on the 28th for the rest of the year.
    expect(
      iso(advance(new Date('2026-01-31T00:00:00Z'), Cadence.MONTHLY)),
    ).toBe('2026-02-28');
    expect(
      iso(advance(new Date('2026-03-31T00:00:00Z'), Cadence.MONTHLY)),
    ).toBe('2026-04-30');
  });

  it('handles the other cadences', () => {
    expect(iso(advance(new Date('2026-08-07T00:00:00Z'), Cadence.WEEKLY))).toBe(
      '2026-08-14',
    );
    expect(
      iso(advance(new Date('2026-08-07T00:00:00Z'), Cadence.QUARTERLY)),
    ).toBe('2026-11-07');
    expect(iso(advance(new Date('2026-08-07T00:00:00Z'), Cadence.YEARLY))).toBe(
      '2027-08-07',
    );
  });

  it('crosses year boundaries', () => {
    expect(
      iso(advance(new Date('2026-12-15T00:00:00Z'), Cadence.MONTHLY)),
    ).toBe('2027-01-15');
    expect(
      iso(advance(new Date('2026-11-15T00:00:00Z'), Cadence.QUARTERLY)),
    ).toBe('2027-02-15');
  });

  it('always moves forward', () => {
    const start = new Date('2026-01-31T00:00:00Z');
    for (const cadence of Object.values(Cadence)) {
      expect(advance(start, cadence).getTime()).toBeGreaterThan(
        start.getTime(),
      );
    }
  });
});
