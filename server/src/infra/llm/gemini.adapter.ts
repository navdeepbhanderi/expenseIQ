import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

import { AppLogger } from '@/common/logger/app-logger.service';
import type { AppConfig } from '@/config/configuration';

import {
  LlmError,
  type ExtractionContext,
  type ExtractionResult,
  type LlmPort,
  type ParseInput,
  type PartialExtraction,
} from './llm.port';
import {
  buildExtractionPrompt,
  EXTRACTION_SCHEMA,
} from './prompts/extraction.prompt';

interface RawExtraction {
  detectedLanguage?: string | null;
  candidates?: unknown[];
}

@Injectable()
export class GeminiAdapter implements LlmPort, OnModuleInit {
  readonly name = 'gemini';

  private client: GoogleGenAI | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('Gemini');
  }

  onModuleInit(): void {
    const llm = this.config.get<AppConfig['llm']>('llm');

    if (!llm?.apiKey) {
      // Warn rather than throw: phases 0–3 have no reason to need a key, and
      // refusing to boot without one would block every other endpoint. The
      // failure surfaces at the first parse instead, where it's actionable.
      this.logger.warn(
        'GEMINI_API_KEY is not set — natural-language entry will return 503',
      );
      return;
    }

    this.client = new GoogleGenAI({ apiKey: llm.apiKey });
  }

  async extract(
    input: ParseInput,
    context: ExtractionContext,
  ): Promise<ExtractionResult> {
    const client = this.requireClient();
    const model = this.model('pro');
    const startedAt = Date.now();

    try {
      const response = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: toParts(input) }],
        config: {
          systemInstruction: buildExtractionPrompt(context),
          responseMimeType: 'application/json',
          responseSchema: EXTRACTION_SCHEMA as unknown as object,
          // Deterministic extraction. This is a parsing task, not a creative
          // one — the same sentence must produce the same transaction twice.
          temperature: 0,
          thinkingConfig: { thinkingBudget: this.thinkingBudget() },
        },
      });

      const parsed = parseJson(response.text ?? '');
      const usage = response.usageMetadata;

      return {
        detectedLanguage: parsed.detectedLanguage ?? null,
        // Cast, not trust: the schema constrains shape, and the NLU service
        // validates every value before any of it reaches the database.
        candidates: (parsed.candidates ?? []) as ExtractionResult['candidates'],
        model,
        latencyMs: Date.now() - startedAt,
        inputTokens: usage?.promptTokenCount ?? null,
        outputTokens: usage?.candidatesTokenCount ?? null,
      };
    } catch (error) {
      throw wrapError(error);
    }
  }

  /**
   * Streams partial readings while the user is still speaking.
   *
   * Each chunk carries the transcript so far plus whatever the model can
   * already tell — design 5b renders "Reading as ₹300 · Groceries · today"
   * mid-sentence. The final chunk is authoritative; everything before it is a
   * preview and must never be written to the ledger.
   */
  async *extractStream(
    input: ParseInput,
    context: ExtractionContext,
  ): AsyncIterable<PartialExtraction> {
    const client = this.requireClient();

    try {
      const stream = await client.models.generateContentStream({
        model: this.model('pro'),
        contents: [{ role: 'user', parts: toParts(input) }],
        config: {
          systemInstruction: buildExtractionPrompt(context),
          responseMimeType: 'application/json',
          responseSchema: EXTRACTION_SCHEMA as unknown as object,
          temperature: 0,
          thinkingConfig: { thinkingBudget: this.thinkingBudget() },
        },
      });

      let accumulated = '';

      for await (const chunk of stream) {
        accumulated += chunk.text ?? '';

        // Emit only once the buffer parses. A JSON stream is unreadable
        // halfway through, so partial chunks are accumulated rather than
        // guessed at.
        const partial = tryParsePartial(accumulated);
        if (partial) {
          yield {
            transcript: input.kind === 'text' ? input.text : '',
            detectedLanguage: partial.detectedLanguage ?? null,
            preview: partial.preview,
          };
        }
      }
    } catch (error) {
      throw wrapError(error);
    }
  }

  /**
   * Flash tier: merchant normalisation is high volume and trivially
   * structured, and paying Pro rates for it is waste.
   *
   * Only reached when the deterministic normaliser has already failed —
   * see MerchantsService. The cheapest call is the one never made.
   */
  async normalizeMerchant(raw: string, known: string[]): Promise<string> {
    const client = this.requireClient();

    try {
      const response = await client.models.generateContent({
        model: this.model('flash'),
        contents: [{ role: 'user', parts: [{ text: raw }] }],
        config: {
          systemInstruction:
            'Return the clean business name from this payment descriptor. ' +
            '"SWIGGY*BLR9284" is "Swiggy". Strip reference numbers, payment ' +
            'rails and city codes. Preserve acronyms like HDFC. Reply with ' +
            'the name and nothing else.' +
            (known.length > 0
              ? ` Prefer these known spellings when they match: ${known.slice(0, 40).join(', ')}.`
              : ''),
          temperature: 0,
          // Thinking disabled, and this is not an optimisation.
          //
          // Gemini 2.5 spends "thinking" tokens out of the SAME maxOutputTokens
          // budget as the answer. Measured on this exact call: 29 thinking
          // tokens against a 32-token ceiling left 0 for the reply, and
          // "SWIGGY*BLR9284" came back as an empty string — silently, with a
          // 200 response. Naming a merchant needs no reasoning, so the budget
          // goes entirely to the answer.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 64,
        },
      });

      return (response.text ?? raw).trim() || raw;
    } catch (error) {
      // Never fatal. A merchant that stays messy is a cosmetic problem; a
      // transaction that fails to save because of one is not.
      this.logger.warn('Merchant normalisation failed, keeping raw name', {
        raw,
        error: error instanceof Error ? error.message : String(error),
      });
      return raw;
    }
  }

  private requireClient(): GoogleGenAI {
    if (!this.client) {
      throw new LlmError(
        'Natural-language entry is not configured on this server',
        false,
      );
    }
    return this.client;
  }

  /**
   * Zero by default — see the env schema for the measurement behind it.
   * Thinking is billed as output and counted against maxOutputTokens, and on
   * a structured extraction task it bought no accuracy for 2.1 extra seconds.
   */
  private thinkingBudget(): number {
    return this.config.get<AppConfig['llm']>('llm')?.thinkingBudget ?? 0;
  }

  private model(tier: 'pro' | 'flash'): string {
    const llm = this.config.get<AppConfig['llm']>('llm');
    return tier === 'pro'
      ? (llm?.models.pro ?? 'gemini-2.5-flash')
      : (llm?.models.flash ?? 'gemini-2.5-flash');
  }
}

function toParts(input: ParseInput): { text: string }[] | object[] {
  if (input.kind === 'text') {
    return [{ text: input.text }];
  }

  return [
    {
      inlineData: {
        mimeType: input.mimeType,
        data: input.data.toString('base64'),
      },
    },
  ];
}

function parseJson(text: string): RawExtraction {
  try {
    return JSON.parse(text) as RawExtraction;
  } catch (error) {
    // Retryable: constrained decoding makes this rare, but a truncated
    // response (hit the token ceiling, connection cut) still lands here and a
    // second attempt is genuinely likely to succeed.
    throw new LlmError('Model returned unparseable JSON', true, error);
  }
}

function tryParsePartial(text: string): {
  detectedLanguage?: string | null;
  preview: {
    amountMinor: number | null;
    category: string | null;
    date: string | null;
  };
} | null {
  try {
    const parsed = JSON.parse(text) as RawExtraction;
    const first = (parsed.candidates?.[0] ?? {}) as Record<string, unknown>;

    return {
      detectedLanguage: parsed.detectedLanguage ?? null,
      preview: {
        amountMinor:
          typeof first.amountMinor === 'number' ? first.amountMinor : null,
        category: typeof first.category === 'string' ? first.category : null,
        date: typeof first.date === 'string' ? first.date : null,
      },
    };
  } catch {
    return null;
  }
}

function wrapError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;

  const message = error instanceof Error ? error.message : String(error);

  // Rate limits and transient server errors are worth retrying; a bad key or
  // a malformed request is not, and retrying it just doubles the latency
  // before the user sees the same failure.
  const retryable =
    /429|rate.?limit|quota|timeout|ETIMEDOUT|ECONNRESET|50[0-9]|unavailable/i.test(
      message,
    );

  return new LlmError(`Gemini request failed: ${message}`, retryable, error);
}
