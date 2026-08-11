import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  EXTRACTION_JSON_SCHEMA,
} from './prompts/extraction.prompt';
import { isWorthAnotherModel, resolveChain } from './model-fallback';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Free-tier chains, measured against this project's own extraction prompt on
 * Hindi, Hinglish, Gujarati, multi-expense and lakh-notation inputs.
 *
 * gemma-4-26b leads on *repeated* measurement: 5/5 correct and a steady
 * 2.6-6.5s across runs. It is also the only free structured-output model that
 * accepts images, so it doubles as the receipt tier.
 *
 * nemotron-3-super is last despite once answering in 280-405ms, and that gap
 * is the lesson. It is a reasoning model: it spends tokens thinking out loud
 * before answering, so under any real load it ran 21-26s and was repeatedly
 * observed queueing past OpenRouter's ~120s upstream timeout. The fast
 * reading was one idle moment, not its behaviour. A single flattering
 * benchmark is not evidence of a p50.
 *
 * openai/gpt-oss-20b:free is absent entirely: it returned zero candidates on
 * all five cases.
 */
const DEFAULT_TEXT_CHAIN = [
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

/** Images need a vision model; only this one also does structured output. */
const DEFAULT_VISION_CHAIN = ['google/gemma-4-26b-a4b-it:free'];

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number };
}

interface RawExtraction {
  detectedLanguage?: string | null;
  candidates?: unknown[];
}

/**
 * OpenRouter, used for its free tier.
 *
 * Same port as Gemini, so the NLU module cannot tell them apart. Chosen as the
 * default because the free allowance is per *account* rather than per model —
 * 50 requests/day, or 1000 once $10 of credits has been bought at any point —
 * where Gemini free meters roughly 20/day per model and zero on every Pro
 * model.
 *
 * It cannot do audio. No free model on the platform accepts it, so
 * `extract({ kind: 'audio' })` throws non-retryably and the provider chain
 * hands off to Gemini, which can.
 */
@Injectable()
export class OpenRouterAdapter implements LlmPort {
  readonly name: string = 'openrouter';

  /*
   * The four things that differ between OpenAI-compatible providers.
   *
   * Groq speaks the same chat-completions dialect, so it subclasses this
   * rather than duplicating the retry, timeout, chain-walking and
   * JSON-repair logic — all of which was written against measured failures
   * and would rot immediately in a second copy.
   */
  protected readonly endpoint: string = ENDPOINT;
  protected readonly providerLabel: string = 'OpenRouter';

  protected credentials(): { apiKey?: string; timeoutMs: number } {
    const llm = this.config.get<AppConfig['llm']>('llm');
    return {
      apiKey: llm?.openRouter.apiKey,
      timeoutMs: llm?.openRouter.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  protected extraHeaders(): Record<string, string> {
    return {
      // OpenRouter attributes usage to these; they are not required, but
      // without them the account dashboard cannot tell this app apart from
      // anything else sharing the key.
      'HTTP-Referer': 'https://github.com/navdeepbhanderi/expenseIQ',
      'X-Title': 'ExpenseIQ',
    };
  }

  constructor(
    protected readonly config: ConfigService,
    protected readonly logger: AppLogger,
  ) {
    this.logger.setContext('OpenRouter');
  }

  async extract(
    input: ParseInput,
    context: ExtractionContext,
  ): Promise<ExtractionResult> {
    if (input.kind === 'audio') {
      // Not retryable: no chain position and no retry count will make a
      // text-only provider hear an audio clip. Failing immediately lets the
      // provider chain reach Gemini while the user is still waiting.
      throw new LlmError(
        'OpenRouter has no free model that accepts audio',
        false,
      );
    }

    const startedAt = Date.now();

    return this.withFallback(
      input.kind === 'image' ? 'vision' : 'text',
      async (model) => {
        const payload = await this.post(model, {
          messages: [
            { role: 'system', content: buildExtractionPrompt(context) },
            { role: 'user', content: toContent(input) },
          ],
          // Deterministic: the same sentence must produce the same transaction
          // twice. Extraction is parsing, not composition.
          temperature: 0,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'extraction',
              strict: true,
              schema: EXTRACTION_JSON_SCHEMA,
            },
          },
        });

        const parsed = parseJson(payload.choices?.[0]?.message?.content ?? '');

        return {
          detectedLanguage: parsed.detectedLanguage ?? null,
          // Cast, not trust: the schema constrains shape, and the NLU service
          // validates every value before any of it reaches the database.
          candidates: (parsed.candidates ??
            []) as ExtractionResult['candidates'],
          // The model that answered, not the one asked for first, so a
          // quota-driven downgrade is visible in the accuracy stats.
          model,
          latencyMs: Date.now() - startedAt,
          inputTokens: payload.usage?.prompt_tokens ?? null,
          outputTokens: payload.usage?.completion_tokens ?? null,
        };
      },
    );
  }

  /**
   * Streaming is not implemented here on purpose.
   *
   * Rather than emit one final chunk dressed up as a stream — which would
   * make design 5b's mid-speech preview appear to work while actually
   * arriving all at once, at the end — this declines outright, and the
   * provider chain falls through to Gemini, which streams for real.
   */
  // eslint-disable-next-line @typescript-eslint/require-await, require-yield
  async *extractStream(): AsyncIterable<PartialExtraction> {
    throw new LlmError(
      'OpenRouter adapter does not implement streaming',
      false,
    );
  }

  async normalizeMerchant(raw: string, known: string[]): Promise<string> {
    try {
      const payload = await this.withFallback('text', (model) =>
        this.post(model, {
          messages: [
            {
              role: 'system',
              content:
                'Return the clean business name from this payment descriptor. ' +
                '"SWIGGY*BLR9284" is "Swiggy". Strip reference numbers, payment ' +
                'rails and city codes. Preserve acronyms like HDFC. Reply with ' +
                'the name and nothing else.' +
                (known.length > 0
                  ? ` Prefer these known spellings when they match: ${known.slice(0, 40).join(', ')}.`
                  : ''),
            },
            { role: 'user', content: raw },
          ],
          temperature: 0,
          max_tokens: 64,
        }),
      );

      return (payload.choices?.[0]?.message?.content ?? raw).trim() || raw;
    } catch (error) {
      // Never fatal. A merchant that stays messy is cosmetic; a transaction
      // that fails to save because of one is not.
      this.logger.warn('Merchant normalisation failed, keeping raw name', {
        raw,
        error: error instanceof Error ? error.message : String(error),
      });
      return raw;
    }
  }

  protected async post(
    model: string,
    body: Record<string, unknown>,
  ): Promise<ChatResponse> {
    const { apiKey, timeoutMs } = this.credentials();

    if (!apiKey) {
      throw new LlmError(
        `No API key configured for ${this.providerLabel}`,
        false,
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // The timer stays armed across BOTH the fetch and the body read, and
      // that is the whole point. OpenRouter answers with headers immediately
      // and then stalls mid-body while an upstream model queues, so a timer
      // cleared once fetch() resolves guards nothing: the request still hangs
      // for their ~120s idle timeout inside response.json(). Measured — a
      // 12s deadline that cleared too early produced 128-150s parses.
      const response = await fetch(this.endpoint, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...this.extraHeaders(),
        },
        body: JSON.stringify({ model, ...body }),
      });

      const payload = (await response.json()) as ChatResponse;

      if (!response.ok) {
        throw Object.assign(
          new Error(
            `${this.providerLabel} request failed: ${payload.error?.message ?? response.statusText}`,
          ),
          { status: response.status },
        );
      }

      // OpenRouter can answer 200 with an error body when an upstream provider
      // fails mid-route. Treated as the upstream status so the chain reacts.
      if (payload.error) {
        throw Object.assign(
          new Error(payload.error.message ?? 'Unknown error'),
          { status: payload.error.code ?? 502 },
        );
      }

      return payload;
    } catch (error) {
      // Surfaced as a 504 so isWorthAnotherModel treats it as worth trying
      // the next model — which is exactly what a contended queue deserves.
      if (error instanceof Error && error.name === 'AbortError') {
        throw Object.assign(
          new Error(`${model} did not respond within ${timeoutMs}ms`),
          { status: 504 },
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Walks the tier's model chain, same rules as the Gemini adapter. */
  private async withFallback<T>(
    tier: 'text' | 'vision',
    call: (model: string) => Promise<T>,
  ): Promise<T> {
    const chain = this.models(tier);
    let lastError: unknown;

    for (const [index, model] of chain.entries()) {
      try {
        return await call(model);
      } catch (error) {
        lastError = error;

        const isLast = index === chain.length - 1;
        if (isLast || !isWorthAnotherModel(error)) {
          throw wrapError(error);
        }

        this.logger.warn('Model unavailable, falling back', {
          tier,
          failed: model,
          next: chain[index + 1],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw wrapError(lastError);
  }

  protected models(tier: 'text' | 'vision'): string[] {
    const llm = this.config.get<AppConfig['llm']>('llm');
    const configured =
      tier === 'text'
        ? llm?.openRouter.models.text
        : llm?.openRouter.models.vision;

    const chain = resolveChain(configured, 'pro');
    // resolveChain's built-in default is Gemini's, which is meaningless here.
    return configured?.trim()
      ? chain
      : tier === 'text'
        ? [...DEFAULT_TEXT_CHAIN]
        : [...DEFAULT_VISION_CHAIN];
  }
}

function toContent(
  input: Extract<ParseInput, { kind: 'text' | 'image' }>,
): unknown {
  if (input.kind === 'text') {
    return input.text;
  }

  return [
    {
      type: 'image_url',
      image_url: {
        url: `data:${input.mimeType};base64,${input.data.toString('base64')}`,
      },
    },
  ];
}

function parseJson(text: string): RawExtraction {
  try {
    return JSON.parse(text) as RawExtraction;
  } catch {
    throw new LlmError(
      `Model returned unparseable JSON: ${text.slice(0, 200)}`,
      true,
    );
  }
}

function wrapError(error: unknown): LlmError {
  if (error instanceof LlmError) {
    return error;
  }

  const status = (error as { status?: unknown }).status;
  const retryable = typeof status === 'number' && status >= 500;

  /*
   * No provider name here — the inner error already carries one.
   *
   * This helper is shared by every OpenAI-compatible subclass, so hardcoding
   * "OpenRouter" produced "OpenRouter request failed: groq request failed: …"
   * on a Groq call, which is confusing in a log and actively misleading in the
   * settings panel where a user reads it to work out which key is broken.
   */
  return new LlmError(
    error instanceof Error ? error.message : String(error),
    retryable,
    error,
  );
}
