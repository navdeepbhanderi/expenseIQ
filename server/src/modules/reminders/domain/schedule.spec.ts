import {
  cycleKeyFor,
  decideReminder,
  offsetMinutesAt,
  OVERDUE_GRACE_DAYS,
  reminderInstant,
} from './schedule';

const base = {
  dueDate: new Date('2026-08-12T00:00:00.000Z'),
  offsetDays: 3,
  timeOfDay: 540, // 9:00
  timezone: 'Asia/Kolkata',
  lastFiredCycle: null as string | null,
};

describe('reminderInstant', () => {
  it('treats the requested time as local, not UTC', () => {
    // 9 am in India is 03:30 UTC. Sending at 09:00 UTC would arrive at
    // 2:30 pm for the user, which is not what "remind me at 9" means.
    const instant = reminderInstant(base);
    expect(instant.toISOString()).toBe('2026-08-09T03:30:00.000Z');
  });

  it('honours the offset in days', () => {
    expect(
      reminderInstant({ ...base, offsetDays: 0 })
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-08-12');
    expect(
      reminderInstant({ ...base, offsetDays: 7 })
        .toISOString()
        .slice(0, 10),
    ).toBe('2026-08-05');
  });

  it('crosses a month boundary', () => {
    const instant = reminderInstant({
      ...base,
      dueDate: new Date('2026-09-02T00:00:00.000Z'),
      offsetDays: 5,
    });
    expect(instant.toISOString().slice(0, 10)).toBe('2026-08-28');
  });

  it('handles a zone behind UTC', () => {
    const instant = reminderInstant({ ...base, timezone: 'America/New_York' });
    // 9 am EDT is 13:00 UTC.
    expect(instant.toISOString()).toBe('2026-08-09T13:00:00.000Z');
  });
});

describe('offsetMinutesAt', () => {
  it('knows India is UTC+5:30', () => {
    expect(
      offsetMinutesAt(new Date('2026-08-09T00:00:00Z'), 'Asia/Kolkata'),
    ).toBe(330);
  });

  it('tracks daylight saving', () => {
    // New York is UTC-4 in August and UTC-5 in January.
    expect(
      offsetMinutesAt(new Date('2026-08-09T12:00:00Z'), 'America/New_York'),
    ).toBe(-240);
    expect(
      offsetMinutesAt(new Date('2026-01-09T12:00:00Z'), 'America/New_York'),
    ).toBe(-300);
  });

  it('falls back to UTC for an unknown zone rather than throwing', () => {
    // One bad profile must not stop every reminder in the system.
    expect(offsetMinutesAt(new Date(), 'Mars/Olympus_Mons')).toBe(0);
  });
});

describe('decideReminder', () => {
  it('stays quiet before the send time', () => {
    const decision = decideReminder({
      ...base,
      now: new Date('2026-08-09T03:00:00.000Z'), // 30 min early
    });
    expect(decision).toEqual({ fire: false, reason: 'too-early' });
  });

  it('fires once the moment arrives', () => {
    const decision = decideReminder({
      ...base,
      now: new Date('2026-08-09T03:30:00.000Z'),
    });

    expect(decision).toMatchObject({
      fire: true,
      kind: 'upcoming',
      cycleKey: '2026-08-12',
      daysUntilDue: 3,
    });
  });

  it('does not re-fire for a cycle it already sent', () => {
    // The spec's edge case: changing the offset mid-cycle must not resend.
    const decision = decideReminder({
      ...base,
      lastFiredCycle: '2026-08-12',
      now: new Date('2026-08-09T03:30:00.000Z'),
    });

    expect(decision).toEqual({ fire: false, reason: 'already-fired' });
  });

  it('re-fires for the next cycle', () => {
    const decision = decideReminder({
      ...base,
      dueDate: new Date('2026-09-12T00:00:00.000Z'),
      lastFiredCycle: '2026-08-12',
      now: new Date('2026-09-09T03:30:00.000Z'),
    });

    expect(decision).toMatchObject({ fire: true, cycleKey: '2026-09-12' });
  });

  it('catches up when a scan runs late', () => {
    // A reminder is useful right up to the due date. Dropping it because the
    // exact minute passed while the process restarted is the worst outcome.
    const decision = decideReminder({
      ...base,
      now: new Date('2026-08-11T18:00:00.000Z'),
    });

    expect(decision).toMatchObject({ fire: true, kind: 'upcoming' });
  });

  it('sends an overdue nudge after the due date', () => {
    const decision = decideReminder({
      ...base,
      now: new Date('2026-08-14T09:00:00.000Z'),
    });

    expect(decision).toMatchObject({
      fire: true,
      kind: 'overdue',
      daysUntilDue: -2,
    });
  });

  it('gives up once the bill is long past', () => {
    // A month-old reminder arriving now reads as a bug.
    const decision = decideReminder({
      ...base,
      now: new Date('2026-09-12T09:00:00.000Z'),
    });

    expect(decision).toEqual({ fire: false, reason: 'too-late' });
    expect(OVERDUE_GRACE_DAYS).toBe(7);
  });

  it('fires on the due date itself when the offset is zero', () => {
    const decision = decideReminder({
      ...base,
      offsetDays: 0,
      now: new Date('2026-08-12T03:30:00.000Z'),
    });

    expect(decision).toMatchObject({
      fire: true,
      kind: 'upcoming',
      daysUntilDue: 0,
    });
  });

  it('keys the cycle on the due date', () => {
    expect(cycleKeyFor(new Date('2026-08-12T18:45:00.000Z'))).toBe(
      '2026-08-12',
    );
  });
});
