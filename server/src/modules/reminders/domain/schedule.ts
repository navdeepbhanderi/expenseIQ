/**
 * When a reminder should fire, and whether it already has.
 *
 * The whole point of this module is the spec's edge case: "If reminder
 * settings change *after* a reminder for that cycle already fired, don't
 * re-fire." A daily scan that simply asks "is today the day?" will re-send
 * every time the user nudges the offset, and will send nothing at all if the
 * scan misses its window because the process was restarting.
 *
 * Both are solved by keying on the **cycle** rather than on the day: a
 * reminder fires at most once per due date, and a scan that runs late still
 * catches up.
 */

export type ReminderKind = 'upcoming' | 'overdue';

export interface ScheduleInput {
  /** The date the money is actually due. */
  dueDate: Date;
  /** Days before the due date to remind. Design 6h: "3 days ahead". */
  offsetDays: number;
  /** Minutes past local midnight. Design 6h: "9 am" → 540. */
  timeOfDay: number;
  /** IANA zone the user lives in. "9 am" means 9 am to them. */
  timezone: string;
  /** The cycle this reminder last fired for, or null. */
  lastFiredCycle: string | null;
  now: Date;
}

export type ScheduleDecision =
  | { fire: false; reason: 'too-early' | 'already-fired' | 'too-late' }
  | { fire: true; cycleKey: string; kind: ReminderKind; daysUntilDue: number };

/**
 * How long after the due date an overdue nudge is still worth sending.
 *
 * Past this, the bill is either paid or the user has bigger problems than a
 * notification, and a month-old reminder arriving now reads as a bug.
 */
export const OVERDUE_GRACE_DAYS = 7;

export function decideReminder(input: ScheduleInput): ScheduleDecision {
  const cycleKey = cycleKeyFor(input.dueDate);

  // Cycle-keyed, so changing the offset mid-cycle cannot cause a second send.
  if (input.lastFiredCycle === cycleKey) {
    return { fire: false, reason: 'already-fired' };
  }

  const fireAt = reminderInstant(input);
  const daysUntilDue = wholeDaysBetween(input.dueDate, input.now);

  if (input.now.getTime() < fireAt.getTime()) {
    return { fire: false, reason: 'too-early' };
  }

  // A scan that runs late still fires — the reminder is useful right up to
  // the due date, and dropping it because the exact minute passed while the
  // process was restarting would be the worst possible behaviour.
  if (daysUntilDue >= 0) {
    return { fire: true, cycleKey, kind: 'upcoming', daysUntilDue };
  }

  if (daysUntilDue >= -OVERDUE_GRACE_DAYS) {
    return { fire: true, cycleKey, kind: 'overdue', daysUntilDue };
  }

  return { fire: false, reason: 'too-late' };
}

/** One reminder per due date. */
export function cycleKeyFor(dueDate: Date): string {
  return dueDate.toISOString().slice(0, 10);
}

/**
 * The exact instant to send, as UTC.
 *
 * `timeOfDay` is local: a user who asks for 9 am means 9 am where they are,
 * not 9 am UTC — which in India would arrive at 2:30 pm. The zone offset is
 * resolved through Intl rather than hardcoded, so it stays correct for a
 * region with daylight saving even though India has none.
 */
export function reminderInstant(input: {
  dueDate: Date;
  offsetDays: number;
  timeOfDay: number;
  timezone: string;
}): Date {
  const target = new Date(
    input.dueDate.getTime() - input.offsetDays * 86_400_000,
  );

  const hours = Math.floor(input.timeOfDay / 60);
  const minutes = input.timeOfDay % 60;

  // Midnight UTC on the target day, plus the requested local time...
  const naive = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
    hours,
    minutes,
  );

  // ...then shifted by the zone's offset on that date, turning a local wall
  // time into a real instant.
  return new Date(
    naive - offsetMinutesAt(new Date(naive), input.timezone) * 60_000,
  );
}

/**
 * Minutes a zone is ahead of UTC on a given date.
 *
 * Derived by formatting the same instant in both zones and differencing,
 * which is the standard trick for doing this without a timezone library and
 * handles daylight saving correctly because Intl does.
 */
export function offsetMinutesAt(instant: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );

    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      // Intl renders midnight as "24" in some locales.
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    );

    return Math.round((asUtc - instant.getTime()) / 60_000);
  } catch {
    // An unknown zone must not stop every reminder in the system; UTC is a
    // wrong-but-harmless fallback and the reminder still arrives.
    return 0;
  }
}

function wholeDaysBetween(later: Date, earlier: Date): number {
  const a = Date.UTC(
    later.getUTCFullYear(),
    later.getUTCMonth(),
    later.getUTCDate(),
  );
  const b = Date.UTC(
    earlier.getUTCFullYear(),
    earlier.getUTCMonth(),
    earlier.getUTCDate(),
  );
  return Math.round((a - b) / 86_400_000);
}
