import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppLogger } from '@/common/logger/app-logger.service';
import type { AppConfig } from '@/config/configuration';
import { LLM_PORT, type LlmPort } from './llm.port';
import { GroqAdapter } from './groq.adapter';
import { FakeLlmAdapter } from './fake-llm.adapter';

/**
 * The platform's provider.
 *
 * One provider, not a chain. ExpenseIQ ships with Groq because its free tier
 * - 14,400 requests a day at 30 a minute - is the only one of the three that a
 * real household does not exhaust: OpenRouter allows 50 a day per account and
 * Gemini roughly 20 per model, at which point expense capture stops working
 * rather than merely slowing down.
 *
 * Anyone who wants a different provider, a stronger model or their own quota
 * brings a key in Settings; that path supports Groq, OpenRouter and Gemini and
 * is per profile. Keeping a second platform provider wired in as well would be
 * dead configuration - nobody would set the keys, and the fallback branch
 * would never run and never be tested.
 *
 * `LLM_DRIVER=fake` selects the deterministic stand-in, which is what
 * integration tests use: it exercises the whole pipeline with no network call,
 * no API key and no bill. With no key configured at all it falls back to fake,
 * so the app stays usable for anyone who has not set one up rather than
 * 503-ing on a feature they could be developing against.
 */
@Global()
@Module({
  providers: [
    GroqAdapter,
    FakeLlmAdapter,
    {
      provide: LLM_PORT,
      inject: [ConfigService, GroqAdapter, FakeLlmAdapter, AppLogger],
      useFactory: (
        config: ConfigService,
        groq: GroqAdapter,
        fake: FakeLlmAdapter,
        logger: AppLogger,
      ): LlmPort => {
        logger.setContext('LlmModule');

        if (process.env.LLM_DRIVER?.trim() === 'fake') {
          return fake;
        }

        const llm = config.get<AppConfig['llm']>('llm');

        if (!llm?.groq.apiKey) {
          logger.warn(
            'Using the deterministic fake LLM adapter - set GROQ_API_KEY for ' +
              'real extraction, or add your own provider key in Settings',
          );
          return fake;
        }

        logger.log(`LLM provider: ${groq.name}`);
        return groq;
      },
    },
  ],
  exports: [LLM_PORT],
})
export class LlmModule {}
