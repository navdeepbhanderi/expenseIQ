import { Injectable } from '@nestjs/common';

import type { AppConfig } from '@/config/configuration';
import { LlmError, type ExtractionContext, type ParseInput } from './llm.port';
import { OpenRouterAdapter } from './openrouter.adapter';
import type { ExtractionResult } from './llm.port';

/**
 * Groq — the platform's default provider.
 *
 * **Why this is the default rather than OpenRouter or Gemini.**
 *
 * Not model quality: an 8B Llama is weaker than several models on the other
 * two. It is the shape of the free tier, which for this product is the thing
 * that decides whether the feature works at all.
 *
 * The core interaction is "say a sentence, get a parse", and people log
 * several expenses a day. OpenRouter's free tier is 50 requests per *account*
 * per day; Gemini's is roughly 20 per model per day and zero on every Pro
 * model. A household hits either ceiling within a week and the product simply
 * stops working — not degrades, stops. Groq allows 14,400 requests a day at
 * 30 a minute, which is past the point where a real user would notice a limit.
 *
 * It is also fast. The design budgets about four seconds for speak-to-
 * confirmed, and an 8B model on Groq's hardware answers well inside that,
 * where a larger model queued on a contended free tier does not.
 *
 * The weaker model matters less than it would have before the date, amount and
 * name resolvers moved into code: the parts a small model gets wrong most
 * often — "kal", "3 lakh", "HDFC" — are no longer its job.
 *
 * **No vision.** llama-3.1-8b-instant is text-only, so receipts throw
 * non-retryably here and the chain hands off to a provider that can see.
 */

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * 14,400 requests/day, 30/minute, 6k tokens/minute.
 *
 * A single model rather than a chain: with a daily cap this high there is
 * nothing to fall back to *within* Groq that would be reached in practice, and
 * the provider chain already handles Groq being down entirely.
 */
const DEFAULT_TEXT_CHAIN = ['llama-3.1-8b-instant'] as const;

const DEFAULT_TIMEOUT_MS = 20_000;

@Injectable()
export class GroqAdapter extends OpenRouterAdapter {
  override readonly name = 'groq';

  protected override readonly endpoint = ENDPOINT;
  protected override readonly providerLabel = 'Groq';

  protected override credentials(): { apiKey?: string; timeoutMs: number } {
    const llm = this.config.get<AppConfig['llm']>('llm');
    return {
      apiKey: llm?.groq.apiKey,
      timeoutMs: llm?.groq.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  protected override extraHeaders(): Record<string, string> {
    // Groq has no attribution headers of its own.
    return {};
  }

  protected override models(tier: 'text' | 'vision'): string[] {
    const llm = this.config.get<AppConfig['llm']>('llm');
    const configured =
      tier === 'text' ? llm?.groq.models.text : llm?.groq.models.vision;

    if (configured?.trim()) {
      return configured
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean);
    }

    // Nothing sensible to offer for vision; extract() refuses it above.
    return tier === 'text' ? [...DEFAULT_TEXT_CHAIN] : [];
  }

  override async extract(
    input: ParseInput,
    context: ExtractionContext,
  ): Promise<ExtractionResult> {
    if (input.kind === 'image') {
      /*
       * Not retryable, so the chain moves on immediately.
       *
       * llama-3.1-8b-instant cannot see. Retrying a text-only model with an
       * image cannot succeed at any position in the chain, and failing fast
       * is what gets the receipt to a provider that can read it while the
       * user is still looking at the spinner.
       */
      throw new LlmError('Groq has no vision model configured', false);
    }

    return super.extract(input, context);
  }
}
