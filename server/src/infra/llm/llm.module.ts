import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppLogger } from '@/common/logger/app-logger.service';
import { LLM_PORT, type LlmPort } from './llm.port';
import { GeminiAdapter } from './gemini.adapter';
import { FakeLlmAdapter } from './fake-llm.adapter';

/**
 * Picks the adapter at boot.
 *
 * `LLM_DRIVER=fake` selects the deterministic stand-in, which is what
 * integration tests use — it exercises the whole pipeline (validation,
 * banding, review queue, confirmation, undo) with no network call, no API key
 * and no bill. Those paths would otherwise be untestable in CI.
 *
 * The default falls back to fake when no Gemini key is present, so the app
 * stays usable for anyone who hasn't set one up yet rather than 503-ing on a
 * feature they could be developing against.
 */
@Global()
@Module({
  providers: [
    GeminiAdapter,
    FakeLlmAdapter,
    {
      provide: LLM_PORT,
      inject: [ConfigService, GeminiAdapter, FakeLlmAdapter, AppLogger],
      useFactory: (
        config: ConfigService,
        gemini: GeminiAdapter,
        fake: FakeLlmAdapter,
        logger: AppLogger,
      ): LlmPort => {
        logger.setContext('LlmModule');

        const driver = process.env.LLM_DRIVER;
        const hasKey = Boolean(config.get<string>('llm.apiKey'));

        if (driver === 'fake' || (!driver && !hasKey)) {
          logger.warn(
            'Using the deterministic fake LLM adapter — set GEMINI_API_KEY ' +
              'for real extraction',
          );
          return fake;
        }

        return gemini;
      },
    },
  ],
  exports: [LLM_PORT],
})
export class LlmModule {}
