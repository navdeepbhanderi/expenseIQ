/**
 * Resolves dates spoken in English, Hindi, Gujarati and Hinglish.
 *
 * **Why this is done in code rather than left to the model.**
 *
 * Date arithmetic is the one part of extraction that is fully determinate: if
 * someone says "yesterday", there is exactly one right answer and no judgement
 * involved. Small models — and every free model in the fallback chain is
 * small — are unreliable at it in a specific and damaging way: they default to
 * today. "kal 482 ka order kiya" comes back dated today, which is wrong in the
 * one direction the user cannot detect at a glance, because today is also what
 * they would see if the date had simply not been mentioned.
 *
 * So the model is still asked for a date, but when the utterance contains an
 * explicit date expression, this overrides it. The model keeps the parts that
 * genuinely need language understanding; the calendar arithmetic is done here
 * where it can be tested.
 *
 * **On "kal" and "parso".** Both are famously ambiguous in Hindi and Gujarati —
 * "kal" is yesterday *or* tomorrow, "parso" the day before *or* after — and the
 * distinction lives in verb tense that we are not parsing. This resolves both
 * to the past, because an expense tracker records what has already been spent.
 * A future-dated expense is a rare thing to log and an obviously wrong one to
 * see; a past-dated one is the overwhelming default. Where the utterance does
 * carry an explicit future marker ("aane wala", "આવતીકાલે"), that wins.
 */

/** What was found, and how sure we are it was really a date. */
export interface ResolvedDate {
  /** ISO YYYY-MM-DD in the user's timezone. */
  date: string;
  /** The substring that produced it, for logging and debugging. */
  matched: string;
  /**
   * High for unambiguous forms ("yesterday", "on the 5th"); lower for ones
   * resting on the past-tense assumption ("kal").
   */
  confidence: number;
}

/*
 * Re-exported rather than defined twice.
 *
 * The same "today in the user's timezone" question is asked by the budgets,
 * dashboard and reminder code; two implementations would eventually disagree,
 * which is exactly how the UTC bug survived as long as it did.
 */
export { todayIn } from '@/common/time/calendar';

/** Adds days to a YYYY-MM-DD without any timezone involvement. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/** 0 = Sunday, matching Date.getUTCDay. */
const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  ravivar: 0,
  रविवार: 0,
  રવિવાર: 0,
  monday: 1,
  mon: 1,
  somvar: 1,
  सोमवार: 1,
  સોમવાર: 1,
  tuesday: 2,
  tue: 2,
  mangalvar: 2,
  मंगलवार: 2,
  મંગળવાર: 2,
  wednesday: 3,
  wed: 3,
  budhvar: 3,
  बुधवार: 3,
  બુધવાર: 3,
  thursday: 4,
  thu: 4,
  guruvar: 4,
  गुरुवार: 4,
  ગુરુવાર: 4,
  friday: 5,
  fri: 5,
  shukravar: 5,
  शुक्रवार: 5,
  શુક્રવાર: 5,
  saturday: 6,
  sat: 6,
  shanivar: 6,
  शनिवार: 6,
  શનિવાર: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  janvari: 1,
  जनवरी: 1,
  જાન્યુઆરી: 1,
  feb: 2,
  february: 2,
  फरवरी: 2,
  ફેબ્રુઆરી: 2,
  mar: 3,
  march: 3,
  मार्च: 3,
  માર્ચ: 3,
  apr: 4,
  april: 4,
  अप्रैल: 4,
  એપ્રિલ: 4,
  may: 5,
  मई: 5,
  મે: 5,
  jun: 6,
  june: 6,
  जून: 6,
  જૂન: 6,
  jul: 7,
  july: 7,
  जुलाई: 7,
  જુલાઈ: 7,
  aug: 8,
  august: 8,
  अगस्त: 8,
  ઓગસ્ટ: 8,
  sep: 9,
  sept: 9,
  september: 9,
  सितंबर: 9,
  સપ્ટેમ્બર: 9,
  oct: 10,
  october: 10,
  अक्टूबर: 10,
  ઓક્ટોબર: 10,
  nov: 11,
  november: 11,
  नवंबर: 11,
  નવેમ્બર: 11,
  dec: 12,
  december: 12,
  दिसंबर: 12,
  ડિસેમ્બર: 12,
};

/*
 * Unicode-aware word boundaries.
 *
 * `\b` is defined against [A-Za-z0-9_], so it does not fire between a space
 * and "आज" — every Devanagari and Gujarati pattern silently failed to match
 * anything. These lookarounds test for "not a letter or digit in any script",
 * which is what a word boundary was always meant to mean here.
 */
const NOT_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_AFTER = '(?![\\p{L}\\p{N}])';

/** Wraps alternatives in boundaries and compiles with the unicode flag. */
function word(pattern: string): RegExp {
  return new RegExp(`${NOT_BEFORE}(?:${pattern})${NOT_AFTER}`, 'u');
}

/** Same, but keeping the caller's capture groups intact. */
function phrase(pattern: string): RegExp {
  return new RegExp(`${NOT_BEFORE}${pattern}${NOT_AFTER}`, 'u');
}

/** Devanagari and Gujarati digits, so "૧૨" and "१२" parse as 12. */
function toLatinDigits(text: string): string {
  return text.replace(/[०-९૦-૯]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code >= 0x0ae6 ? 0x0ae6 : 0x0966;
    return String(code - base);
  });
}

/**
 * Finds a date expression in the utterance.
 *
 * Returns null when nothing date-like is said, which is the common case and
 * means "leave the model's answer alone" — usually today, correctly.
 */
export function resolveDate(
  utterance: string,
  today: string,
): ResolvedDate | null {
  const text = toLatinDigits(utterance.toLowerCase());

  // Ordered most specific first: "day before yesterday" must be tested before
  // "yesterday", or the longer phrase never matches.
  const found =
    explicitIso(text) ??
    numericDate(text, today) ??
    monthAndDay(text, today) ??
    dayOfMonth(text, today) ??
    daysAgo(text, today) ??
    lastWeekday(text, today) ??
    weeksAgo(text, today) ??
    relativeDay(text, today);

  return found;
}

/** 2026-08-05, exactly as written. */
function explicitIso(text: string): ResolvedDate | null {
  const m = phrase(String.raw`(\d{4})-(\d{2})-(\d{2})`).exec(text);
  if (!m) return null;
  return { date: m[0], matched: m[0], confidence: 0.99 };
}

/**
 * 5/8/2026 and 05-08-26 — day first, which is the Indian convention.
 *
 * Deliberately not accepting month-first: guessing wrong silently files an
 * expense months away, and there is no way to tell 5/8 from 8/5 without a
 * convention. India writes day first, and this is an India-first product.
 */
function numericDate(text: string, today: string): ResolvedDate | null {
  const m = phrase(String.raw`(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?`).exec(
    text,
  );
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const year = m[3]
    ? Number(m[3]) < 100
      ? 2000 + Number(m[3])
      : Number(m[3])
    : Number(today.slice(0, 4));

  const iso = clamp(year, month, day);
  // A bare day/month with no year that lands in the future is almost certainly
  // last year's — nobody logs an expense they have not made yet.
  if (!m[3] && iso > today)
    return {
      date: clamp(year - 1, month, day),
      matched: m[0],
      confidence: 0.8,
    };

  return { date: iso, matched: m[0], confidence: 0.9 };
}

/** "5 aug", "aug 5", "5 अगस्त", "૫ ઓગસ્ટ". */
function monthAndDay(text: string, today: string): ResolvedDate | null {
  const names = Object.keys(MONTHS).join('|');

  const m =
    phrase(String.raw`(\d{1,2})\s*(?:st|nd|rd|th)?\s+(${names})`).exec(text) ??
    phrase(String.raw`(${names})\s+(\d{1,2})`).exec(text);
  if (!m) return null;

  const isDayFirst = /^\d/.test(m[1]!);
  const day = Number(isDayFirst ? m[1] : m[2]);
  const month = MONTHS[(isDayFirst ? m[2] : m[1])!]!;
  if (day < 1 || day > 31) return null;

  const year = Number(today.slice(0, 4));
  const iso = clamp(year, month, day);

  // Same reasoning as above — a future date without a year means last year.
  return iso > today
    ? { date: clamp(year - 1, month, day), matched: m[0], confidence: 0.85 }
    : { date: iso, matched: m[0], confidence: 0.95 };
}

/**
 * "on the 5th", "5 tarikh", "5 तारीख को", "૫ તારીખે" — a day in this month.
 *
 * Guarded tightly. A bare number is almost always the amount, so this only
 * fires when the number is attached to an ordinal suffix or an explicit
 * date-marker word. "spent 500" must never be read as "the 500th".
 */
function dayOfMonth(text: string, today: string): ResolvedDate | null {
  const m =
    phrase(String.raw`(?:on\s+(?:the\s+)?)?(\d{1,2})\s*(?:st|nd|rd|th)`).exec(
      text,
    ) ??
    phrase(
      String.raw`(\d{1,2})\s*(?:tarikh|tareekh|तारीख|તારીખ)[eોંેो\u0902\u0948]?`,
    ).exec(text) ??
    phrase(String.raw`(?:तारीख|તારીખ)\s*(\d{1,2})`).exec(text);
  if (!m) return null;

  const day = Number(m[1]);
  if (day < 1 || day > 31) return null;

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const iso = clamp(year, month, day);

  /*
   * A day later in this month has not happened yet, so it means last month.
   *
   * Said on 3 August, "on the 28th" is 28 July — the alternative is filing an
   * expense 25 days in the future, which no one means.
   */
  if (iso > today) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return {
      date: clamp(prevYear, prevMonth, day),
      matched: m[0],
      confidence: 0.8,
    };
  }

  return { date: iso, matched: m[0], confidence: 0.9 };
}

/** "3 days ago", "3 din pehle", "3 दिन पहले", "3 દિવસ પહેલા". */
function daysAgo(text: string, today: string): ResolvedDate | null {
  /*
   * "before" only counts when it is not the "day before yesterday" phrase —
   * otherwise "spent 500 day before yesterday" parses as 500 days ago, which
   * is both wrong and wildly so.
   */
  const m = phrase(
    String.raw`(\d{1,3})\s*(?:days?|din|दिन|દિવસ)\s*(?:ago|pehle|pahle|before(?!\s+yesterday)|पहले|પહેલા|પહેલાં)`,
  ).exec(text);
  if (!m) return null;

  return {
    date: addDays(today, -Number(m[1])),
    matched: m[0],
    confidence: 0.95,
  };
}

/** "2 weeks ago", "2 hafte pehle", "पिछले हफ्ते". */
function weeksAgo(text: string, today: string): ResolvedDate | null {
  const m = phrase(
    String.raw`(\d{1,2})\s*(?:weeks?|hafte|hafta|सप्ताह|हफ्ते|અઠવાડિયા)\s*(?:ago|pehle|pahle|पहले|પહેલા)`,
  ).exec(text);
  if (m) {
    return {
      date: addDays(today, -7 * Number(m[1])),
      matched: m[0],
      confidence: 0.9,
    };
  }

  const lastWeek = word('last week|pichle hafte|पिछले हफ्ते|ગયા અઠવાડિયે').exec(
    text,
  );
  if (lastWeek) {
    return { date: addDays(today, -7), matched: lastWeek[0], confidence: 0.6 };
  }

  return null;
}

/** "last Tuesday", "pichle mangalvar" — the most recent one before today. */
function lastWeekday(text: string, today: string): ResolvedDate | null {
  const names = Object.keys(WEEKDAYS).join('|');
  const m = phrase(
    String.raw`(?:last|past|pichle|pichhle|गत|पिछले|ગયા)?\s*(${names})`,
  ).exec(text);
  if (!m) return null;

  const target = WEEKDAYS[m[1]!]!;
  const [y, mo, d] = today.split('-').map(Number) as [number, number, number];
  const current = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();

  // Strictly before today: "last Tuesday" said on a Tuesday means a week ago,
  // not this morning — otherwise the word "last" does no work.
  const back = (current - target + 7) % 7 || 7;

  return { date: addDays(today, -back), matched: m[0], confidence: 0.85 };
}

/** today / yesterday / day before yesterday, and their future counterparts. */
function relativeDay(text: string, today: string): ResolvedDate | null {
  const now = word('today|aaj|abhi|आज|હમણાં|આજે').exec(text);
  if (now) return { date: today, matched: now[0], confidence: 0.99 };

  // Explicit future markers, checked before the ambiguous words they contain.
  const tomorrow = word(
    'tomorrow|aane wala kal|kal subah|आने वाला कल|આવતીકાલે',
  ).exec(text);
  if (tomorrow) {
    return { date: addDays(today, 1), matched: tomorrow[0], confidence: 0.9 };
  }

  const dayBefore = word(
    'day before yesterday|parso|parsoñ|परसों|પરમદિવસે|પરમ દિવસે',
  ).exec(text);
  if (dayBefore) {
    // "parso" is also the day after tomorrow; past wins for an expense log.
    const sure = dayBefore[0].includes('day before yesterday');
    return {
      date: addDays(today, -2),
      matched: dayBefore[0],
      confidence: sure ? 0.99 : 0.7,
    };
  }

  const yesterday = word(
    'yesterday|kal|kaal|बीता कल|कल|ગઈકાલે|ગઇકાલે|गईकाल',
  ).exec(text);
  if (yesterday) {
    const sure = /yesterday|ગઈકાલે|ગઇકાલે|बीता कल/.test(yesterday[0]);
    return {
      date: addDays(today, -1),
      matched: yesterday[0],
      // A bare "kal" rests on the past-tense assumption, so it is offered
      // with less certainty and shows as a field worth glancing at.
      confidence: sure ? 0.98 : 0.75,
    };
  }

  return null;
}

/** Builds an ISO date, clamping the day into the month's real length. */
function clamp(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safe = Math.min(day, last);
  return `${year}-${String(month).padStart(2, '0')}-${String(safe).padStart(2, '0')}`;
}

export const _internals = { DAY_MS };

/**
 * How many distinct date expressions the utterance contains.
 *
 * Used to decide whether one resolved date may be applied to several
 * candidates. "kal groceries 300 aur petrol 1200" names one day and means it
 * for both; "kal groceries 300 aur aaj petrol 1200" names two, and attributing
 * them to the right clause needs real sentence parsing rather than a guess.
 */
export function countDateExpressions(utterance: string): number {
  const text = utterance.toLowerCase();

  /*
   * Counted by scanning windows rather than by matching the whole string,
   * because the resolvers deliberately return only the first hit. Splitting on
   * the common conjunctions is enough to tell "one date, several expenses"
   * from "several dates" — which is the only distinction that matters here.
   */
  // Punctuation needs no leading space — "300, આજે" is one of the commonest
  // ways to list two expenses, and requiring one meant it never split.
  const clauses = text.split(/\s+(?:and|aur|ane|અને|और|ane)\s+|\s*[,;।|]\s*/);

  const dates = new Set<string>();
  for (const clause of clauses) {
    // Any date at all in this clause; the year is irrelevant to the count.
    const found = resolveDate(clause, '2000-01-01');
    if (found) dates.add(found.matched);
  }

  return dates.size;
}
