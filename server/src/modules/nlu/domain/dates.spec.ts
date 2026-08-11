import { addDays, countDateExpressions, resolveDate, todayIn } from './dates';

/**
 * A Monday, deliberately: it makes "last Tuesday" a six-day step rather than
 * the one-day step that would also be produced by an off-by-one bug.
 */
const TODAY = '2026-08-10';

const on = (utterance: string) => resolveDate(utterance, TODAY);

describe('todayIn', () => {
  it('reports the local date, not the UTC one', () => {
    /*
     * 01:00 IST on 11 August is 19:30 UTC on the 10th. The naive
     * toISOString().slice(0,10) answers "2026-08-10", so someone logging a
     * late dinner got every relative date shifted a day back.
     */
    const lateNightIst = new Date('2026-08-10T19:30:00.000Z');
    expect(todayIn('Asia/Kolkata', lateNightIst)).toBe('2026-08-11');
    expect(lateNightIst.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('agrees with UTC in the middle of the day', () => {
    expect(todayIn('Asia/Kolkata', new Date('2026-08-10T09:00:00.000Z'))).toBe(
      '2026-08-10',
    );
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('resolveDate — the reported bug', () => {
  it('reads "yesterday" as yesterday, not today', () => {
    // The whole reason this module exists: the model answered today.
    expect(on('yesterday spend 500')?.date).toBe('2026-08-09');
  });

  it('leaves an utterance with no date alone', () => {
    // Null means "keep whatever the model said", which for an unstated date
    // is today — correctly, since people log expenses as they happen.
    expect(on('spent 500 on groceries')).toBeNull();
  });

  it('never reads a bare amount as a day of the month', () => {
    // "spent 500" must not become the 500th, nor the 5th.
    expect(on('spent 500')).toBeNull();
    expect(on('300 rupees kirane pe')).toBeNull();
  });
});

describe('resolveDate — English', () => {
  it.each([
    ['today', '2026-08-10'],
    ['yesterday', '2026-08-09'],
    ['day before yesterday', '2026-08-08'],
    ['tomorrow', '2026-08-11'],
    ['3 days ago', '2026-08-07'],
    ['2 weeks ago', '2026-07-27'],
    ['last week', '2026-08-03'],
  ])('%s', (phrase, expected) => {
    expect(on(`spent 500 ${phrase}`)?.date).toBe(expected);
  });

  it('resolves last Tuesday to the most recent one', () => {
    // Monday the 10th → Tuesday the 4th.
    expect(on('paid 200 last tuesday')?.date).toBe('2026-08-04');
  });

  it('reads "last Monday" as a week back, not this morning', () => {
    // Today IS Monday. Without the strict-before rule this returns today and
    // the word "last" does nothing.
    expect(on('paid 200 last monday')?.date).toBe('2026-08-03');
  });
});

describe('resolveDate — a specific day of this month', () => {
  it('reads an ordinal', () => {
    expect(on('spent 500 on the 5th')?.date).toBe('2026-08-05');
  });

  it('reads a bare ordinal without "on the"', () => {
    expect(on('bought petrol 3rd')?.date).toBe('2026-08-03');
  });

  it('reads "tarikh"', () => {
    expect(on('5 tarikh ko 500 diye')?.date).toBe('2026-08-05');
  });

  it('reads the Devanagari and Gujarati forms', () => {
    expect(on('७ तारीख को 500 खर्च किए')?.date).toBe('2026-08-07');
    expect(on('૭ તારીખે 500 વાપર્યા')?.date).toBe('2026-08-07');
  });

  it('rolls a future day back to last month', () => {
    /*
     * Said on the 10th, "the 28th" cannot mean this month — that has not
     * happened. Filing it 18 days in the future would put it beyond every
     * "this month" total the user looks at.
     */
    expect(on('spent 900 on the 28th')?.date).toBe('2026-07-28');
  });

  it('clamps a day the previous month does not have', () => {
    expect(resolveDate('paid on the 31st', '2026-03-05')?.date).toBe(
      '2026-02-28',
    );
  });
});

describe('resolveDate — explicit dates', () => {
  it('reads an ISO date verbatim', () => {
    expect(on('spent 500 on 2026-07-04')?.date).toBe('2026-07-04');
  });

  it('reads day-first numeric dates, the Indian convention', () => {
    // 5/8 is 5 August, never 8 May.
    expect(on('spent 500 on 5/8/2026')?.date).toBe('2026-08-05');
    expect(on('spent 500 on 04-07-26')?.date).toBe('2026-07-04');
  });

  it('reads a month name either way round', () => {
    expect(on('spent 500 on 5 aug')?.date).toBe('2026-08-05');
    expect(on('spent 500 on aug 5')?.date).toBe('2026-08-05');
  });

  it('reads Hindi and Gujarati month names', () => {
    expect(on('500 अगस्त 5 को')?.date).toBe('2026-08-05');
    expect(on('૫ ઓગસ્ટ 500')?.date).toBe('2026-08-05');
  });

  it('treats a yearless future date as last year', () => {
    // Said in August, "20 december" is the December just gone.
    expect(on('paid 500 on 20 december')?.date).toBe('2025-12-20');
  });
});

describe('resolveDate — Hindi and Hinglish', () => {
  it.each([
    ['aaj', '2026-08-10'],
    ['आज', '2026-08-10'],
    ['kal', '2026-08-09'],
    ['कल', '2026-08-09'],
    ['parso', '2026-08-08'],
    ['परसों', '2026-08-08'],
    ['3 din pehle', '2026-08-07'],
    ['3 दिन पहले', '2026-08-07'],
  ])('%s', (phrase, expected) => {
    expect(on(`${phrase} 482 kharch kiye`)?.date).toBe(expected);
  });

  it('scores a bare "kal" lower than an unambiguous "yesterday"', () => {
    /*
     * "kal" is yesterday or tomorrow depending on tense. Resolving to the past
     * is the right default for an expense log, but the user should see it as a
     * field worth a glance rather than a settled fact.
     */
    const ambiguous = on('kal 482 kharch kiye')!;
    const certain = on('yesterday spent 482')!;
    expect(ambiguous.confidence).toBeLessThan(certain.confidence);
  });

  it('prefers an explicit future marker over the past default', () => {
    expect(on('aane wala kal 500 dena hai')?.date).toBe('2026-08-11');
  });
});

describe('resolveDate — Gujarati', () => {
  it.each([
    ['આજે', '2026-08-10'],
    ['ગઈકાલે', '2026-08-09'],
    ['3 દિવસ પહેલા', '2026-08-07'],
  ])('%s', (phrase, expected) => {
    expect(on(`${phrase} 1200 વાપર્યા`)?.date).toBe(expected);
  });

  it('parses Gujarati digits', () => {
    expect(on('આજે ૧૨૦૦ નું પેટ્રોલ')?.date).toBe('2026-08-10');
  });
});

describe('resolveDate — precedence', () => {
  it('prefers an explicit date over a relative word', () => {
    // Both appear; the specific one is what the user actually pinned down.
    expect(on('yesterday I paid the 5 aug bill')?.date).toBe('2026-08-05');
  });

  it('prefers "day before yesterday" over the "yesterday" inside it', () => {
    expect(on('day before yesterday spent 500')?.date).toBe('2026-08-08');
  });
});

describe('countDateExpressions', () => {
  it('finds one date shared across several expenses', () => {
    // The case that used to be skipped, leaving both entries dated today.
    expect(countDateExpressions('kal groceries 300 aur petrol 1200')).toBe(1);
  });

  it('finds two when the sentence names two days', () => {
    // Attributing each to the right clause needs real parsing, so the
    // override has to stand down here.
    expect(countDateExpressions('kal groceries 300 aur aaj petrol 1200')).toBe(
      2,
    );
  });

  it('finds none when no date is spoken', () => {
    expect(countDateExpressions('groceries 300 and petrol 1200')).toBe(0);
  });

  it('counts a repeated word once', () => {
    // Saying "kal" twice is still one day.
    expect(countDateExpressions('kal 300 aur kal 1200')).toBe(1);
  });

  it('splits on English and Hindi conjunctions alike', () => {
    expect(countDateExpressions('yesterday 300 and today 1200')).toBe(2);
    expect(countDateExpressions('ગઈકાલે 300, આજે 1200')).toBe(2);
  });
});
