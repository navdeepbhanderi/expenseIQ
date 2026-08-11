import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppLogger } from '@/common/logger/app-logger.service';
import type { AppConfig } from '@/config/configuration';
import { LLM_PORT, type LlmPort } from './llm.port';
import { GeminiAdapter } from './gemini.adapter';
import { OpenRouterAdapter } from './openrouter.adapter';
import { GroqAdapter } from './groq.adapter';
import { FakeLlmAdapter } from './fake-llm.adapter';
import { ChainLlmAdapter } from './chain.adapter';

/**
 * Builds the provider chain at boot.
 *
 * `LLM_DRIVER` is a comma-separated order. The default is `groq,openrouter,
 * gemini`: Groq leads because its free tier allows 14,400 requests a day
 * against OpenRouter's 50 and Gemini's ~20 per model, and a product whose core
 * interaction is one parse per expense stops working entirely at those lower
 * ceilings rather than merely slowing down. The older reasoning below still
 * explains the relative order of the two behind it —
 * puts OpenRouter first because its free tier is metered per *account*
 * (50 requests/day, 1000 once $10 of credits has ever been bought) while
 * Gemini free meters roughly 20/day per model and zero on every Pro model.
 * Gemini sits behind it as the backstop and as the only provider that
 * accepts audio or streams.
 *
 * `LLM_DRIVER=fake` selects the deterministic stand-in, which is what
 * integration tests use — it exercises the whole pipeline (validation,
 * banding, review queue, confirmation, undo) with no network call, no API key
 * and no bill. Those paths would otherwise be untestable in CI.
 *
 * With no keys at all it falls back to fake, so the app stays usable for
 * anyone who hasn't set one up rather than 503-ing on a feature they could be
 * developing against.
 */
@Global()
@Module({
  providers: [
    GeminiAdapter,
    OpenRouterAdapter,
    GroqAdapter,
    FakeLlmAdapter,
    {
      provide: LLM_PORT,
      inject: [
        ConfigService,
        GeminiAdapter,
        OpenRouterAdapter,
        GroqAdapter,
        FakeLlmAdapter,
        AppLogger,
      ],
      useFactory: (
        config: ConfigService,
        gemini: GeminiAdapter,
        openRouter: OpenRouterAdapter,
        groq: GroqAdapter,
        fake: FakeLlmAdapter,
        logger: AppLogger,
      ): LlmPort => {
        logger.setContext('LlmModule');

        const llm = config.get<AppConfig['llm']>('llm');
        const driver = process.env.LLM_DRIVER?.trim();

        if (driver === 'fake') {
          return fake;
        }

        const available: Record<string, { port: LlmPort; keyed: boolean }> = {
          groq: { port: groq, keyed: Boolean(llm?.groq.apiKey) },
          openrouter: {
            port: openRouter,
            keyed: Boolean(llm?.openRouter.apiKey),
          },
          gemini: { port: gemini, keyed: Boolean(llm?.apiKey) },
        };

        // ?? would keep an empty LLM_DRIVER="" as the value and yield an
        // empty chain, so the emptiness is checked, not just the nullishness.
        const order =
          driver !== undefined && driver.length > 0
            ? driver
            : 'groq,openrouter,gemini';

        const requested = order
          .split(',')
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean);

        // A provider with no key is dropped rather than left in to fail on
        // every call — the chain would still work, but each request would pay
        // its round trip to discover the same missing key.
        const chain = requested
          .filter((name) => available[name]?.keyed)
          .map((name) => available[name]!.port);

        if (chain.length === 0) {
          logger.warn(
            'Using the deterministic fake LLM adapter — set GROQ_API_KEY, ' +
              'OPENROUTER_API_KEY or GEMINI_API_KEY for real extraction',
          );
          return fake;
        }

        const skipped = requested.filter((name) => !available[name]?.keyed);
        if (skipped.length > 0) {
          logger.warn('LLM providers skipped, no API key configured', {
            skipped,
          });
        }

        if (chain.length === 1) {
          logger.log(`LLM provider: ${chain[0]!.name}`);
          return chain[0]!;
        }

        const composed = new ChainLlmAdapter(chain, logger);
        logger.log(`LLM provider chain: ${composed.name}`);
        return composed;
      },
    },
  ],
  exports: [LLM_PORT],
})
export class LlmModule {}
