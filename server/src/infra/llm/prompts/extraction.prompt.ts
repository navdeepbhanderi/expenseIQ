import type { ExtractionContext } from '../llm.port';
import { todayIn } from '@/modules/nlu/domain/dates';

/**
 * One call does language detection, internal translation and extraction.
 *
 * The spec is explicit that the user never sees a translation step — they type
 * or speak in whatever language they think in and get structured output back.
 * Splitting it into detect → translate → extract would triple the latency and
 * the cost for a flow the design budgets at about four seconds end to end.
 */
export function buildExtractionPrompt(context: ExtractionContext): string {
  /*
   * The user's today, not the server's.
   *
   * toISOString() is UTC, so for an IST user between midnight and 05:30 this
   * stated yesterday's date — and every relative date the model produced was
   * then a day out. Someone logging a late dinner got the wrong day, silently.
   */
  const today = todayIn(context.timezone, context.today);

  // Named so the model can anchor "last <weekday>" without counting back.
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: context.timezone,
    weekday: 'long',
  }).format(context.today);

  return `You extract expense records from how people actually talk about money in India.

TODAY IS ${today}, a ${weekday} (timezone ${context.timezone}).

DATES — get these right, they are checked.
Resolve every relative expression against today:
- "today", "aaj", "abhi", "आज", "આજે" → ${today}
- "yesterday", "kal", "ગઈકાલે" → the day BEFORE today
- "day before yesterday", "parso", "परसों" → two days before
- "3 days ago", "3 din pehle", "3 દિવસ પહેલા" → count back that many days
- "last Tuesday" → the most recent Tuesday STRICTLY before today
- "on the 5th", "5 tarikh", "5 तारीख", "૫ તારીખે" → the 5th of THIS month; if
  that day has not arrived yet, the 5th of LAST month
- "5/8" is 5 August. India writes the day first. Never read it as 8 May.

Hindi and Gujarati "kal" and "parso" mean either direction depending on tense.
This is an expense log, so assume the PAST unless the sentence clearly points
forward. A date you were not given is today — but a date you WERE given is
never today.

INPUT LANGUAGE
The input may be English, Hindi, Gujarati, any other Indian language, or — most
commonly — a mix of them in one sentence. "petrol bharwaya 1200" and
"300 रुपये किराने पे खर्च किए" and "amma ko 5000 bheje" are all normal input.
Understand it directly. Do not translate it back to the user; just extract.

MULTIPLE EXPENSES
One sentence may describe several. "groceries 300, uber 640, and bijli ka bill
2400" is THREE separate records, not one. Return one candidate per expense.
Return an empty array only if the input describes no expense at all.

AMOUNTS
- Report in paise: ₹300 is 30000. ₹2,140.50 is 214050.
- Indian numbering is common: "3 lakh" is 30000000 paise, "1.5 cr" is
  15000000000 paise, "5k" is 500000 paise.
- Money received is direction CREDIT (salary, refunds, "mila", "aaya").
  Money spent is DEBIT. Default to DEBIT when genuinely ambiguous.
- If no amount is stated, use null. Do NOT guess one.

CATEGORY
Choose exactly one from this list, or null if none fits:
${context.categories.map((c) => `  - ${c}`).join('\n')}
Never invent a category outside this list.

ACCOUNT
Choose exactly one from this list, or null if the input does not name one:
${context.accounts.length > 0 ? context.accounts.map((a) => `  - ${a}`).join('\n') : '  (none configured)'}
"hdfc card", "on my sbi", "cash se" name an account. Silence does not.

MERCHANT
The business paid, cleaned up: "SWIGGY*BLR9284" → "Swiggy". Null if none named.
${
  context.knownMerchants.length > 0
    ? `Prefer these known spellings where they match:\n${context.knownMerchants
        .slice(0, 40)
        .map((m) => `  - ${m}`)
        .join('\n')}`
    : ''
}

CONFIDENCE
Score every field 0-1 by how certain you are it is correct — not by how
plausible it is. Be honest and be harsh: a low score sends the entry for a
human glance, which is cheap. A wrongly confident score corrupts someone's
ledger, which is not.

- Stated outright: 0.9-1.0.
- Inferred from context and genuinely uncertain: below 0.6.
- Not mentioned at all: set the field to null and score it 0.

ONE EXCEPTION, and it matters. When no date is given, use today and score it
0.9. People log expenses as they happen, so "no date stated" almost always
means today — this is a near-certainty, not a guess, and scoring it low would
send every ordinary entry for review over the one field nobody doubts.

Return only the structured object. No prose, no explanation.`;
}

/**
 * The JSON Schema Gemini is constrained to.
 *
 * With `responseMimeType: application/json` and this schema, the model cannot
 * emit malformed JSON — the decoder won't let it. That turns the roadmap's
 * "retry on malformed output" from the primary mechanism into a rare fallback.
 * It does *not* make the values right, which is why semantic validation still
 * runs afterwards.
 */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    detectedLanguage: {
      type: 'string',
      description: 'Language of the input, e.g. "hi", "gu", "en", "hi-en"',
      nullable: true,
    },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          amountMinor: {
            type: 'integer',
            description: 'Amount in paise. Null if not stated.',
            nullable: true,
          },
          direction: { type: 'string', enum: ['DEBIT', 'CREDIT'] },
          category: { type: 'string', nullable: true },
          merchant: { type: 'string', nullable: true },
          date: {
            type: 'string',
            description: 'ISO date, YYYY-MM-DD',
            nullable: true,
          },
          account: { type: 'string', nullable: true },
          note: { type: 'string', nullable: true },
          confidence: { type: 'number' },
          fieldConfidence: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              category: { type: 'number' },
              merchant: { type: 'number' },
              date: { type: 'number' },
              account: { type: 'number' },
            },
            required: ['amount', 'category', 'merchant', 'date', 'account'],
          },
        },
        required: ['direction', 'confidence', 'fieldConfidence'],
      },
    },
  },
  required: ['candidates'],
} as const;

/**
 * The same contract as EXTRACTION_SCHEMA, in the JSON Schema dialect that
 * OpenAI-compatible providers (OpenRouter) expect.
 *
 * Two dialects rather than one because the differences are not cosmetic:
 * Gemini marks optional fields `nullable: true`, while strict-mode JSON Schema
 * has no such keyword — nullability is a type union, and *every* property must
 * appear in `required` with `additionalProperties: false`. Feeding either
 * schema to the other provider is rejected outright.
 *
 * Kept beside its twin so a field added to one is obviously missing from the
 * other. The nullable fields carry `null` in their type union precisely so
 * "not stated" stays expressible — a model forced to emit a string for a date
 * nobody gave will invent one.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['detectedLanguage', 'candidates'],
  properties: {
    detectedLanguage: {
      type: ['string', 'null'],
      description: 'Language of the input, e.g. "hi", "gu", "en", "hi-en"',
    },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'amountMinor',
          'direction',
          'category',
          'merchant',
          'date',
          'account',
          'note',
          'confidence',
          'fieldConfidence',
        ],
        properties: {
          amountMinor: {
            type: ['integer', 'null'],
            description: 'Amount in paise. Null if not stated.',
          },
          direction: { type: 'string', enum: ['DEBIT', 'CREDIT'] },
          category: { type: ['string', 'null'] },
          merchant: { type: ['string', 'null'] },
          date: {
            type: ['string', 'null'],
            description: 'ISO date, YYYY-MM-DD',
          },
          account: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          fieldConfidence: {
            type: 'object',
            additionalProperties: false,
            required: ['amount', 'category', 'merchant', 'date', 'account'],
            properties: {
              amount: { type: 'number' },
              category: { type: 'number' },
              merchant: { type: 'number' },
              date: { type: 'number' },
              account: { type: 'number' },
            },
          },
        },
      },
    },
  },
} as const;
