/**
 * Matches a spoken name to a category or account the user actually has.
 *
 * The previous implementation was `row.name.toLowerCase() === wanted`. Exact
 * equality is close to useless against speech: the model returns "HDFC" for
 * an account called "HDFC Millennia", "grocery" for "Groceries", "food" for
 * "Eating out". Every one of those failed, the field came back missing, and
 * the user was asked to pick something the system had already understood —
 * which is precisely the friction the product exists to remove.
 *
 * The matcher runs in tiers, strongest first, and reports which tier fired so
 * the caller can decide how much to trust it. Nothing here guesses wildly: a
 * match below the threshold is no match, because asking is better than filing
 * an expense to the wrong account.
 */

export interface NameMatch<T> {
  row: T;
  /** 1 for an exact hit, lower for alias, prefix and fuzzy matches. */
  score: number;
  how: 'exact' | 'alias' | 'contains' | 'token' | 'fuzzy';
}

/**
 * Below this, the guess is not worth making.
 *
 * Set where "hdfc" still finds "HDFC Millennia" but "swiggy" does not get
 * quietly filed to "Savings" on the strength of a couple of shared letters.
 */
const THRESHOLD = 0.55;

/**
 * Category synonyms, in the three languages the product was tested in.
 *
 * Keyed by the seeded category names. These are the words people actually
 * use — "kirana" is far more common than "groceries" in Hinglish speech, and
 * a model handed the utterance verbatim will return it unchanged.
 */
const CATEGORY_ALIASES: Record<string, string[]> = {
  groceries: [
    'grocery',
    'kirana',
    'kirane',
    'karyana',
    'sabzi',
    'vegetables',
    'supermarket',
    'bigbasket',
    'dmart',
    'किराना',
    'सब्जी',
    'કરિયાણું',
    'શાકભાજી',
  ],
  'eating out': [
    'food',
    'restaurant',
    'dining',
    'takeaway',
    'swiggy',
    'zomato',
    'khana',
    'hotel',
    'cafe',
    'lunch',
    'dinner',
    'breakfast',
    'खाना',
    'रेस्टोरेंट',
    'ખાવાનું',
    'જમવાનું',
  ],
  fuel: [
    'petrol',
    'diesel',
    'gas',
    'cng',
    'pump',
    'filling',
    'पेट्रोल',
    'डीजल',
    'પેટ્રોલ',
    'ડીઝલ',
  ],
  transport: [
    'travel',
    'taxi',
    'auto',
    'rickshaw',
    'uber',
    'ola',
    'bus',
    'train',
    'metro',
    'cab',
    'किराया',
    'ऑटो',
    'રિક્ષા',
    'બસ',
  ],
  utilities: [
    'electricity',
    'bill',
    'water',
    'gas bill',
    'broadband',
    'internet',
    'recharge',
    'mobile',
    'bijli',
    'बिजली',
    'वીજળી',
    'વીજળી',
  ],
  rent: ['house rent', 'makan', 'kiraya', 'किराया', 'भाड़ा', 'ભાડું'],
  health: [
    'medicine',
    'medical',
    'doctor',
    'hospital',
    'pharmacy',
    'chemist',
    'dawai',
    'दवा',
    'डॉक्टर',
    'દવા',
    'ડૉક્ટર',
  ],
  shopping: [
    'clothes',
    'clothing',
    'amazon',
    'flipkart',
    'myntra',
    'kapde',
    'कपड़े',
    'खरीदारी',
    'કપડાં',
  ],
  entertainment: [
    'movie',
    'cinema',
    'netflix',
    'spotify',
    'subscription',
    'game',
    'फिल्म',
    'ફિલ્મ',
  ],
  education: ['school', 'college', 'fees', 'tuition', 'books', 'फीस', 'ફી'],
  salary: ['pay', 'paycheck', 'income', 'wages', 'तनख्वाह', 'पगार', 'પગાર'],
};

/** Words that carry no identifying weight in an account name. */
const ACCOUNT_NOISE = new Set([
  'bank',
  'account',
  'savings',
  'saving',
  'current',
  'card',
  'credit',
  'debit',
  'wallet',
  'my',
  'the',
  'a',
]);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text: string): string[] {
  return normalise(text).split(' ').filter(Boolean);
}

/**
 * Crudely strips an English plural.
 *
 * "grocery" and "groceries" are three edits apart, which no sane fuzzy
 * threshold treats as the same word — yet a model returning the singular for
 * a category named in the plural is the single most common near-miss. Handled
 * as a rule rather than by loosening the fuzzy gate, which would start
 * matching genuinely unrelated words.
 */
function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('es')) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/**
 * Damerau-Levenshtein distance, capped for speed.
 *
 * Damerau rather than plain Levenshtein because it counts a transposition as
 * one edit, and transposition is exactly what a mistyped or misheard bank
 * name is: "hdcf" for "hdfc". Plain Levenshtein charges two for that, which
 * puts a one-slip typo below any threshold loose enough to be safe.
 *
 * Here for slips only — not for finding loosely related words.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;

  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1)
    rows.push([i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + cost,
      );

      // The transposition case.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i]![j] = Math.min(rows[i]![j]!, rows[i - 2]![j - 2]! + cost);
      }
    }
  }

  return rows[a.length]![b.length]!;
}

/** 1 for identical, falling to 0 as edits accumulate. */
function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return 1 - editDistance(a, b) / longest;
}

/**
 * Finds the best row for a spoken name.
 *
 * `aliases` is consulted by the *row's* name, so a profile that renamed
 * "Groceries" to "Kirana" simply matches exactly and never needs them.
 */
export function matchName<T extends { id: string; name: string }>(
  rows: T[],
  spoken: string | null,
  options: { aliases?: Record<string, string[]>; noise?: Set<string> } = {},
): NameMatch<T> | null {
  if (!spoken) return null;

  const wanted = normalise(spoken);
  if (!wanted) return null;

  const aliases = options.aliases ?? {};
  const noise = options.noise ?? new Set<string>();

  let best: NameMatch<T> | null = null;
  const consider = (candidate: NameMatch<T>) => {
    if (!best || candidate.score > best.score) best = candidate;
  };

  for (const row of rows) {
    const name = normalise(row.name);

    if (name === wanted) {
      consider({ row, score: 1, how: 'exact' });
      continue;
    }

    // Aliases for this row, e.g. "kirana" listed under "groceries".
    if ((aliases[name] ?? []).some((alias) => normalise(alias) === wanted)) {
      consider({ row, score: 0.95, how: 'alias' });
      continue;
    }

    /*
     * One name contained in the other — "hdfc" inside "hdfc millennia".
     *
     * Scored by how much of the longer name the shorter one accounts for, so
     * a distinctive fragment beats an incidental one. Guarded on length: "a"
     * appears inside almost everything.
     */
    /*
     * Spelled-out initials — "h.d.f.c." normalises to "h d f c".
     *
     * Compared with whitespace removed so the letters reassemble into the
     * word they were always meant to be. Speech-to-text produces this
     * routinely for acronyms.
     */
    const compactWanted = wanted.replace(/\s/g, '');
    const compactName = name.replace(/\s/g, '');
    if (compactWanted.length >= 3 && compactWanted === compactName) {
      consider({ row, score: 0.92, how: 'alias' });
      continue;
    }

    // Singular against plural: "grocery" for "Groceries".
    if (
      wanted.length >= 4 &&
      tokens(wanted).map(stem).join(' ') === tokens(name).map(stem).join(' ')
    ) {
      consider({ row, score: 0.9, how: 'alias' });
      continue;
    }

    if (
      compactWanted.length >= 3 &&
      (compactName.includes(compactWanted) ||
        compactWanted.includes(compactName))
    ) {
      const [short, long] =
        compactName.length < compactWanted.length
          ? [compactName, compactWanted]
          : [compactWanted, compactName];
      consider({
        row,
        score: 0.6 + 0.3 * (short.length / long.length),
        how: 'contains',
      });
      continue;
    }

    /*
     * Shared significant words.
     *
     * "axis card" against "Flipkart Axis Bank" shares "axis" once "card" and
     * "bank" are discarded as noise — without that filter every card account
     * matches every other one on the word "card" alone.
     */
    const spokenTokens = tokens(wanted).filter((t) => !noise.has(t));
    const rowTokens = tokens(name).filter((t) => !noise.has(t));

    if (spokenTokens.length > 0 && rowTokens.length > 0) {
      const shared = spokenTokens.filter((t) => rowTokens.includes(t));
      if (shared.length > 0) {
        const coverage =
          shared.length / Math.max(spokenTokens.length, rowTokens.length);
        consider({ row, score: 0.55 + 0.35 * coverage, how: 'token' });
        continue;
      }

      // A near-miss on a single word: "hdcf" for "hdfc".
      const fuzzy = Math.max(
        ...spokenTokens.flatMap((s) => rowTokens.map((r) => similarity(s, r))),
      );
      // 0.7 admits a single transposition in a four-letter acronym, which is
      // the shortest real name we need to survive one slip in.
      if (fuzzy >= 0.7) {
        consider({ row, score: fuzzy * 0.8, how: 'fuzzy' });
      }
    }
  }

  // TS cannot see that `consider` narrows this; the cast is local and checked.
  const winner = best as NameMatch<T> | null;
  return winner && winner.score >= THRESHOLD ? winner : null;
}

/** Categories, with the multilingual synonym table applied. */
export function matchCategory<T extends { id: string; name: string }>(
  rows: T[],
  spoken: string | null,
): NameMatch<T> | null {
  return matchName(rows, spoken, { aliases: CATEGORY_ALIASES });
}

/** Accounts, ignoring the words every account name shares. */
export function matchAccount<T extends { id: string; name: string }>(
  rows: T[],
  spoken: string | null,
): NameMatch<T> | null {
  return matchName(rows, spoken, { noise: ACCOUNT_NOISE });
}

export const _testing = { normalise, similarity, CATEGORY_ALIASES };
