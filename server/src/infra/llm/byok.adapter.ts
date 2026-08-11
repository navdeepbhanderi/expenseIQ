import type { ConfigService } from '@nestjs/config';

import type { AppLogger } from '@/common/logger/app-logger.service';
import { LlmError } from './llm.port';
import { OpenRouterAdapter } from './openrouter.adapter';

/**
 * Calls a provider with a key the user supplied, rather than one from config.
 *
 * Built per request and thrown away, because the plaintext key exists only for
 * the duration of the call. Nothing here is registered with the DI container:
 * a singleton holding a decrypted key would keep it in memory for the life of
 * the process and shared across every profile.
 *
 * **One adapter for all three providers.** Groq and OpenRouter speak
 * OpenAI's chat-completions dialect, and Google publishes an OpenAI-compatible
 * endpoint for Gemini alongside its native SDK. Using it here means one code
 * path — with the retry, timeout, chain-walking and JSON-repair logic that was
 * written against measured failures — instead of a second Gemini integration
 * that would need all of it again.
 */

const ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  gemini:
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
};

/**
 * Deliberately shorter than the platform's.
 *
 * A user's own key is usually on a paid or personal quota with far less
 * queueing than a shared free tier, so a long stall is more likely to mean
 * something is wrong than that it is merely busy — and every second spent
 * waiting here is a second before the platform fallback can rescue the parse.
 */
const TIMEOUT_MS = 15_000;

export class ByokAdapter extends OpenRouterAdapter {
  override readonly name: string;

  protected override readonly endpoint: string;
  protected override readonly providerLabel: string;

  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    provider: string,
    model: string,
    apiKey: string,
    logger: AppLogger,
  ) {
    /*
     * No ConfigService.
     *
     * Both methods that would reach for it — credentials() and models() — are
     * overridden below, so it is never touched. Passing a stub is honest about
     * that; wiring a real one would suggest this adapter reads configuration
     * when its whole purpose is not to.
     */
    super(undefined as unknown as ConfigService, logger);

    const endpoint = ENDPOINTS[provider];
    if (!endpoint) {
      // Not retryable: no amount of retrying invents an endpoint. The resolver
      // falls back to the platform immediately.
      throw new LlmError(`No endpoint known for provider "${provider}"`, false);
    }

    this.name = `byok:${provider}`;
    this.endpoint = endpoint;
    this.providerLabel = provider;
    this.apiKey = apiKey;
    this.model = model;
  }

  protected override credentials(): { apiKey?: string; timeoutMs: number } {
    return { apiKey: this.apiKey, timeoutMs: TIMEOUT_MS };
  }

  protected override extraHeaders(): Record<string, string> {
    // The OpenRouter attribution headers would be wrong on the other two, and
    // on OpenRouter they would attribute a user's own spend to this app.
    return {};
  }

  protected override models(): string[] {
    // Exactly what the user chose — no chain. Falling through to a second
    // model on their key would spend their quota on something they did not ask
    // for, and the platform is already the fallback.
    return [this.model];
  }
}
