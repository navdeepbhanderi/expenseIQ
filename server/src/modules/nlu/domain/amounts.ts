/**
 * Resolves amounts spoken with Indian scale words.
 *
 * Like the date resolver, this exists because the failure is silent. A model
 * that mishears "teen lakh" as 3 produces ₹3 - plausible-looking, wrong by
 * five orders of magnitude, and filed without complaint. "5k" comes back as 5,
 * "1.5 crore" as 1.5. The user sees a number, and a number is what they
 * expected, so nothing looks amiss until a total is inspected weeks later.
 *
 * Deliberately narrow. This only fires when the utterance contains an explicit
 * scale word - lakh, crore, hazaar, k, thousand and their Devanagari and
 * Gujarati spellings. A bare "482" is left entirely to the model, which reads
 * it correctly and has the context to know which of several numbers in a
 * sentence is the amount. Overriding those would trade a rare failure for a
 * common one.
 */

export interface ResolvedAmount {
  /** Paise, never a float - the whole product's money rule. */
  amountMinor: number;
  /** The substring that produced it. */
  matched: string;
  confidence: number;
}

/** Scale words and what they multiply by. */
const SCALES: { pattern: string; multiplier: number }[] = [
  { pattern: 'crores?|cr|karod|करोड़|કરોડ', multiplier: 1_00_00_000 },
  { pattern: 'lakhs?|lacs?|lakhon|लाख|લાખ', multiplier: 1_00_000 },
  {
    pattern: 'thousands?|hazaar|hazar|hajar|k|हज़ार|हजार|હજાર',
    multiplier: 1_000,
  },
];

/**
 * Fractional prefixes, which are ordinary speech rather than an edge case.
 *
 * "sava lakh" is 1.25 lakh and "dedh lakh" is 1.5 - said far more often than
 * the digits are. A model that does not know them returns the scale alone.
 */
const FRACTIONS: Record<string, number> = {
  adha: 0.5,
  aadha: 0.5,
  आधा: 0.5,
  અડધો: 0.5,
  paune: 0.75,
  पौने: 0.75,
  sava: 1.25,
  savva: 1.25,
  सवा: 1.25,
  સવા: 1.25,
  dedh: 1.5,
  derh: 1.5,
  डेढ़: 1.5,
  દોઢ: 1.5,
  dhai: 2.5,
  ढाई: 2.5,
  અઢી: 2.5,
};

/** Devanagari and Gujarati digits to Latin. */
function toLatinDigits(text: string): string {
  return text.replace(/[०-९૦-૯]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code >= 0x0ae6 ? 0x0ae6 : 0x0966;
    return String(code - base);
  });
}

const NOT_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_AFTER = '(?![\\p{L}\\p{N}])';

/**
 * Finds a scaled amount, or null when there is nothing to correct.
 *
 * Null is the common case and means "keep whatever the model said".
 */
export function resolveAmount(utterance: string): ResolvedAmount | null {
  const text = toLatinDigits(utterance.toLowerCase());
  const fractionNames = Object.keys(FRACTIONS).join('|');

  for (const { pattern, multiplier } of SCALES) {
    /*
     * A number, or a fraction word, immediately before the scale.
     *
     * Requiring one or the other is what keeps this from firing on "k" inside
     * an unrelated word, and on a bare "lakh" with no quantity - which is a
     * turn of phrase ("lakhon log") rather than an amount.
     */
    const numeric = new RegExp(
      `${NOT_BEFORE}(\\d+(?:[.,]\\d+)?)\\s*(?:${pattern})${NOT_AFTER}`,
      'u',
    ).exec(text);

    if (numeric) {
      const value = Number(numeric[1]!.replace(',', '.'));
      if (Number.isFinite(value) && value > 0) {
        return {
          amountMinor: toPaise(value * multiplier),
          matched: numeric[0],
          // "5k" is unambiguous; the risk is the model, not the reading.
          confidence: 0.95,
        };
      }
    }

    const fractional = new RegExp(
      `${NOT_BEFORE}(${fractionNames})\\s*(?:${pattern})${NOT_AFTER}`,
      'u',
    ).exec(text);

    if (fractional) {
      return {
        amountMinor: toPaise(FRACTIONS[fractional[1]!]! * multiplier),
        matched: fractional[0],
        confidence: 0.85,
      };
    }
  }

  return null;
}

/**
 * Rupees to paise, rounded rather than truncated.
 *
 * 1.5 lakh is 150000 exactly, but floating-point multiplication of a fraction
 * by a large scale can land a hair under - and truncating that loses a paisa
 * in a way that never reconciles.
 */
function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
