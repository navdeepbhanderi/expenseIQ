import { Inject, Injectable } from '@nestjs/common';

import { AppLogger } from '@/common/logger/app-logger.service';
import {
  LLM_PORT,
  LlmError,
  type ExtractionContext,
  type ExtractionResult,
  type LlmPort,
  type ParseInput,
} from '@/infra/llm/llm.port';
import { ByokAdapter } from '@/infra/llm/byok.adapter';
import { LlmSettingsService } from './llm-settings.service';

/**
 * Chooses which model answers a given parse.
 *
 * The platform's own provider is the default, so the product works the moment
 * someone signs up. A profile that has saved its own key uses that instead -
 * their quota, their provider, their choice of model.
 *
 * **Why a user's key does not simply fail closed.**
 *
 * If someone's own key stops working - revoked, out of quota, mistyped past
 * the shape check - the alternative to falling back is that expense capture,
 * the product's entire point, stops. So the platform provider catches it, and
 * the failure is recorded against the credential so Settings can say plainly
 * that their key is failing and why. Silently absorbing it would be worse than
 * either: the user would never learn their key was doing nothing.
 */
@Injectable()
export class LlmResolver {
  constructor(
    @Inject(LLM_PORT) private readonly platform: LlmPort,
    private readonly settings: LlmSettingsService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('LlmResolver');
  }

  async extract(
    profileId: string,
    input: ParseInput,
    context: ExtractionContext,
  ): Promise<ExtractionResult> {
    const credential = await this.settings.reveal(profileId);

    if (!credential) {
      return this.platform.extract(input, context);
    }

    try {
      const result = await new ByokAdapter(
        credential.provider,
        credential.model,
        credential.apiKey,
        this.logger,
      ).extract(input, context);

      // Recorded so Settings can say the key has actually worked, rather than
      // only that it was accepted by the shape check when it was saved.
      await this.settings.noteSuccess(profileId);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      /*
       * The user's key is named in the log, the platform absorbs the request,
       * and the reason is stored where the user will see it.
       *
       * Never the key itself - not in the message, not in the metadata.
       */
      this.logger.warn('User LLM key failed, falling back to the platform', {
        profileId,
        provider: credential.provider,
        model: credential.model,
        error: message,
      });

      await this.settings.noteFailure(profileId, message);

      if (error instanceof LlmError && !error.retryable) {
        // An input this provider fundamentally cannot handle - audio on a
        // text-only model. The platform chain may still manage it.
        return this.platform.extract(input, context);
      }

      return this.platform.extract(input, context);
    }
  }
}
