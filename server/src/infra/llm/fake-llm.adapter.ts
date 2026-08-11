import { Injectable } from '@nestjs/common';
import { normalizeMerchant } from '@/modules/merchants/domain/normalize';
import { resolveDate, todayIn } from '@/modules/nlu/domain/dates';
import type {
  ExtractionContext,
  ExtractionResult,
  LlmPort,
  ParseInput,
  PartialExtraction,
} from './llm.port';

/**
 * A deterministic stand-in for the model.
 *
 * Not a mock in the usual sense — it genuinely parses a useful subset of
 * input, so integration tests can exercise the whole pipeline (validation,
 * banding, review queue, confirmation, undo) without a network call, an API
 * key, or a bill. Tests that mattered would otherwise be untestable in CI.
 *
 * It also makes local development possible before anyone has a Gemini key.
 * Selected by `LLM_DRIVER=fake`.
 *
 * It is deliberately *not* clever. Anything it can't read comes back with a
 * null amount and low confidence, which is exactly what a real low-confidence
 * parse looks like — so the review-queue paths get exercised too.
 */
@Injectable()
export class FakeLlmAdapter implements LlmPort {
  readonly name = 'fake';

  extract(
    input: ParseInput,
    context: ExtractionContext,
  ): Promise<ExtractionResult> {
    // Image and audio inputs get a plausible low-confidence result rather than
    // nothing. Real vision output is not reproducible offline, but the
    // pipeline downstream — staging, banding, confirmation — is the same, and
    // it must be exercised without a network call.
    const text =
      input.kind === 'text' ? input.text : describeBinary(input.data);
    const startedAt = Date.now();

    // Split on separators people actually use when listing several expenses.
    const clauses = text
      .split(/,| and | aur | ane |;/i)
      .map((clause) => clause.trim())
      .filter(Boolean);

    const candidates = clauses
      .map((clause) => this.parseClause(clause, context))
      .filter((candidate) => candidate !== null);

    return Promise.resolve({
      detectedLanguage: detectLanguage(text),
      candidates,
      model: 'fake',
      latencyMs: Date.now() - startedAt,
      inputTokens: text.length,
      outputTokens: candidates.length * 20,
    });
  }

  async *extractStream(
    input: ParseInput,
    context: ExtractionContext,
  ): AsyncIterable<PartialExtraction> {
    const result = await this.extract(input, context);
    const text = input.kind === 'text' ? input.text : '';
    const first = result.candidates[0];

    // Two chunks, so a consumer that assumes exactly one is caught.
    yield {
      transcript: text.slice(0, Math.ceil(text.length / 2)),
      detectedLanguage: result.detectedLanguage,
      preview: { amountMinor: null, category: null, date: null },
    };

    yield {
      transcript: text,
      detectedLanguage: result.detectedLanguage,
      preview: {
        amountMinor: first?.amountMinor ?? null,
        category: first?.category ?? null,
        date: first?.date ?? null,
      },
    };
  }

  normalizeMerchant(raw: string): Promise<string> {
    return Promise.resolve(normalizeMerchant(raw));
  }

  private parseClause(
    clause: string,
    context: ExtractionContext,
  ): ExtractionResult['candidates'][number] | null {
    // Only genuinely empty fragments are dropped. Anything a person typed is
    // an attempt to log something — "paid rahul back" has no amount, but
    // design 3d shows exactly that case sitting in the queue asking for one.
    // Discarding it here would silently lose the user's input, which the spec
    // forbids outright.
    if (!/\p{L}{2}|\d/u.test(clause)) {
      return null;
    }

    const amountMinor = parseAmount(clause);
    const category = matchFromList(clause, context.categories);
    const account = matchFromList(clause, context.accounts);
    const statedDate = parseDate(clause, context.today, context.timezone);
    const isCredit = /\b(salary|received|refund|credited|mila|aaya)\b/i.test(
      clause,
    );

    const fieldConfidence = {
      amount: amountMinor === null ? 0 : 0.98,
      category: category ? 0.92 : 0,
      merchant: 0,
      // An unstated date defaults to today and is scored high, not zero.
      // For expense entry that inference is overwhelmingly right — design 2b
      // shows the date chip reading "Today" on an entry that never mentioned
      // one. Scoring it zero would drag every such entry to NEEDS_FIELD.
      date: statedDate ? 0.95 : 0.9,
      account: account ? 0.9 : 0,
    };

    return {
      amountMinor,
      direction: isCredit ? ('CREDIT' as const) : ('DEBIT' as const),
      category,
      merchant: null,
      date: statedDate ?? todayIn(context.timezone, context.today),
      account,
      note: null,
      confidence: amountMinor === null ? 0.3 : category ? 0.92 : 0.65,
      fieldConfidence,
    };
  }
}

/** Handles plain digits plus the Indian scale words that appear constantly. */
function parseAmount(text: string): number | null {
  const scaled = /(\d+(?:\.\d+)?)\s*(k|lakh|lakhs|lac|cr|crore)\b/i.exec(text);

  if (scaled) {
    const value = Number(scaled[1]);
    const unit = (scaled[2] ?? '').toLowerCase();
    const multiplier =
      unit === 'k' ? 1_000 : unit.startsWith('cr') ? 1_00_00_000 : 1_00_000;
    return Math.round(value * multiplier * 100);
  }

  const plain =
    /(?:₹|rs\.?|rupees?|rupaye|रुपये|રૂપિયા)?\s*(\d[\d,]*(?:\.\d{1,2})?)/i.exec(
      text,
    );

  if (!plain?.[1]) return null;

  const value = Number(plain[1].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

/** Matches a category or account name, plus a few common vernacular words. */
function matchFromList(text: string, options: string[]): string | null {
  const lower = text.toLowerCase();

  for (const option of options) {
    const head = option.toLowerCase().split(/[\s&]/)[0] ?? '';
    if (head.length > 2 && lower.includes(head)) return option;
  }

  const hints: Record<string, string[]> = {
    Groceries: ['kirana', 'kirane', 'grocer', 'किराने', 'किराना', 'sabzi'],
    'Eating out': ['swiggy', 'zomato', 'restaurant', 'dinner', 'lunch'],
    Travel: ['uber', 'ola', 'cab', 'taxi', 'flight', 'train'],
    Fuel: ['petrol', 'diesel', 'fuel', 'bharwaya'],
    Utilities: ['bijli', 'electricity', 'बिजली', 'bill', 'recharge'],
  };

  for (const [category, words] of Object.entries(hints)) {
    if (!options.includes(category)) continue;
    if (words.some((word) => lower.includes(word))) return category;
  }

  return null;
}

/**
 * Defers to the real resolver rather than keeping a second, weaker copy.
 *
 * The fake adapter exists so tests never call a live model — but it should
 * still behave like the production path does. Its own two-case regex handled
 * "yesterday" and nothing else, so every test written against it passed while
 * the real pipeline mishandled "on the 5th" and "3 din pehle".
 */
function parseDate(text: string, today: Date, timezone: string): string | null {
  return resolveDate(text, todayIn(timezone, today))?.date ?? null;
}

function detectLanguage(text: string): string {
  if (/[઀-૿]/.test(text)) return 'gu';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  // Romanised Hindi/Gujarati mixed with English is the common case, and
  // calling it "en" would be wrong in a way that matters for this product.
  if (/\b(kiya|kiye|pe|par|ko|se|bharwaya|kharch|bheje|rupaye)\b/i.test(text)) {
    return 'hi-en';
  }
  return 'en';
}

/**
 * A stand-in reading of a binary upload.
 *
 * Derived from the bytes so it is deterministic per file: the same receipt
 * always "reads" the same, which is what makes duplicate-detection and
 * idempotency tests meaningful.
 */
function describeBinary(data: Buffer): string {
  const amount = 100 + (data.byteLength % 9900);
  return `${amount} groceries`;
}
