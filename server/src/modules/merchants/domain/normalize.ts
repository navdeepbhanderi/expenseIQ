/**
 * Merchant-string normalisation, without an LLM.
 *
 * Payment descriptors are formulaic - "SWIGGY*BLR9284", "UPI/DMART/9284718",
 * "POS 1234 AMAZON PAY IN". Stripping the machine parts handles the large
 * majority of them deterministically, for free and in microseconds.
 *
 * This runs *before* any model call, so the LLM is reserved for the strings
 * this can't reduce. The roadmap asks for a merchant cache to avoid repeat
 * LLM calls; the cheapest cache hit is the one that never needed the model.
 */

/** Payment-rail prefixes that carry no merchant information. */
const RAIL_PREFIXES = [
  'upi',
  'pos',
  'neft',
  'imps',
  'rtgs',
  'ach',
  'ecs',
  'atm',
  'nach',
  'mandate',
  'vps',
  'ib',
  'inb',
];

/** Trailing noise: "PVT LTD", country and city tags. */
const TRAILING_NOISE =
  /[\s,.]*\b(pvt|private|ltd|limited|llp|inc|corp|co|company|india|in|bengaluru|blr|mumbai|mum|delhi|del|chennai|hyderabad|hyd|pune|noida|gurgaon|ggn)\b\.?$/i;

/**
 * Acronyms that must survive title-casing - "HDFC" cannot become "Hdfc".
 *
 * An allowlist rather than pure heuristics because the general rule has no
 * good answer for "SBI": it's short and all-caps like an acronym, but it
 * contains a vowel like a word.
 */
const KNOWN_ACRONYMS = new Set([
  'HDFC',
  'ICICI',
  'SBI',
  'IDFC',
  'IDBI',
  'RBL',
  'PNB',
  'BOB',
  'AU',
  'YES',
  'BSNL',
  'MTNL',
  'LIC',
  'IOC',
  'BPCL',
  'HPCL',
  'ONGC',
  'NTPC',
  'GAIL',
  'TCS',
  'ITC',
  'DMRC',
  'BMTC',
  'BEST',
  'KSEB',
  'MSEB',
  'TNEB',
  'JIO',
  'ATM',
  'UPI',
  'EMI',
  'DTH',
  'OTT',
  'NBFC',
  'PVR',
  'KFC',
  'HP',
]);

export function normalizeMerchant(raw: string): string {
  if (!raw.trim()) return '';

  let value = raw.trim();

  // Everything before a '*' is the acquirer's own tag in most Indian card
  // descriptors: "SWIGGY*BLR9284" → "SWIGGY", but "PAYU*BOOKMYSHOW" → the
  // meaningful half is the second. Prefer the longest alphabetic segment.
  if (value.includes('*')) {
    const segments = value.split('*').map((part) => part.trim());
    value =
      segments
        .filter((part) => /[a-z]/i.test(part))
        .sort((a, b) => letterCount(b) - letterCount(a))[0] ?? value;
  }

  // Slash-delimited rails: "UPI/DMART/9284718" → "DMART".
  if (value.includes('/')) {
    const segments = value
      .split('/')
      .map((part) => part.trim())
      .filter(
        (part) =>
          part.length > 0 &&
          !RAIL_PREFIXES.includes(part.toLowerCase()) &&
          /[a-z]/i.test(part),
      );
    value =
      segments.sort((a, b) => letterCount(b) - letterCount(a))[0] ?? value;
  }

  // Leading rail token: "POS 1234 AMAZON" → "AMAZON".
  const words = value.split(/[\s_-]+/).filter(Boolean);
  while (
    words.length > 1 &&
    (RAIL_PREFIXES.includes((words[0] ?? '').toLowerCase()) ||
      /^\d+$/.test(words[0] ?? ''))
  ) {
    words.shift();
  }
  value = words.join(' ');

  // Reference numbers glued to the name, and standalone digit runs.
  //
  // \p{M} - combining marks - is essential, not incidental. Devanagari vowel
  // signs are separate combining codepoints, so a class of \p{L} alone strips
  // every matra and turns "किराना स्टोर" into "क र न स ट र". In a product
  // whose whole premise is Hindi and Gujarati input, that is not a rough edge.
  value = value
    .replace(/\b[a-z]*\d{4,}[a-z]*\b/gi, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s&'.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Looped, because the noise stacks: "PVT LTD" needs two passes, and a single
  // anchored replace would leave "Reliance Retail Pvt".
  let previous: string;
  do {
    previous = value;
    value = value.replace(TRAILING_NOISE, '').trim();
  } while (value !== previous && value.length > 0);

  if (!value) return raw.trim();

  return toTitleCase(value);
}

function letterCount(value: string): number {
  return (value.match(/[a-z]/gi) ?? []).length;
}

/**
 * Title case, preserving deliberate acronyms.
 *
 * A naive "all-caps and short means acronym" rule fails badly: it keeps
 * "UBER", "BANK" and "TRIP" shouting, because descriptors arrive entirely in
 * capitals and those are all four characters. So an allowlist handles the
 * known names, plus a vowel-free fallback for initialisms it hasn't met.
 */
function toTitleCase(value: string): string {
  return value
    .split(' ')
    .map((word) => (isAcronym(word) ? word.toUpperCase() : titleCaseWord(word)))
    .join(' ');
}

function isAcronym(word: string): boolean {
  const upper = word.toUpperCase();

  if (KNOWN_ACRONYMS.has(upper)) return true;

  // A short, all-caps, vowel-free token is an initialism by construction -
  // no English or transliterated word is pronounceable without one.
  return (
    word === upper &&
    /[A-Z]/.test(word) &&
    word.length <= 5 &&
    !/[AEIOU]/.test(word)
  );
}

function titleCaseWord(word: string): string {
  // Scripts without case (Devanagari, Gujarati) pass through unchanged,
  // because toUpperCase and toLowerCase are the identity for them.
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
