import { type AppLogger } from '@/common/logger/app-logger.service';

import {
  LlmError,
  type ExtractionContext,
  type ExtractionResult,
  type LlmPort,
  type ParseInput,
  type PartialExtraction,
} from './llm.port';

/**
 * Several providers behind one port, tried in order.
 *
 * This is a different fallback from the model chains inside each adapter, and
 * deliberately so. Within a provider, an auth failure is terminal — the same
 * key fails on every model, so walking the chain only multiplies the latency
 * of a certain failure. Across providers it is the opposite: a dead key, a
 * revoked project, an unsupported input kind are all exactly the cases where
 * the *next provider* is the answer. So this falls over on anything.
 *
 * That distinction is not hypothetical. This project's Gemini key returned
 * 403 PERMISSION_DENIED at the project level while OpenRouter answered the
 * identical prompt, which is precisely the failure the model-level rule is
 * built to ignore and this one is built to catch.
 */
export class ChainLlmAdapter implements LlmPort {
  readonly name: string;

  constructor(
    private readonly providers: LlmPort[],
    private readonly logger: AppLogger,
  ) {
    if (providers.length === 0) {
      throw new Error('ChainLlmAdapter needs at least one provider');
    }

    this.name = providers.map((provider) => provider.name).join('>');
    this.logger.setContext('LlmChain');
  }

  async extract(
    input: ParseInput,
    context: ExtractionContext,
  ): Promise<ExtractionResult> {
    return this.attempt('extract', (provider) =>
      provider.extract(input, context),
    );
  }

  /**
   * Streaming resolves the provider eagerly, before yielding.
   *
   * A provider that cannot stream must be discovered while the response is
   * still empty. Switching mid-sentence would rewrite text the user is
   * already reading, so once chunks flow the provider is committed.
   */
  async *extractStream(
    input: ParseInput,
    context: ExtractionContext,
  ): AsyncIterable<PartialExtraction> {
    let lastError: unknown;

    for (const provider of this.providers) {
      const iterator = provider
        .extractStream(input, context)
        [Symbol.asyncIterator]();

      let first;
      try {
        first = await iterator.next();
      } catch (error) {
        lastError = error;
        this.logger.warn('Provider cannot stream, trying next', {
          provider: provider.name,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      // An immediately-finished stream is a success, not a failure to fall
      // over from — the provider answered, the answer was just empty.
      if (first.done) return;

      yield first.value;

      // Committed from here: errors propagate rather than restarting, because
      // the client is already rendering what came before them.
      let next = await iterator.next();
      while (!next.done) {
        yield next.value;
        next = await iterator.next();
      }

      return;
    }

    throw wrap(lastError, 'extractStream');
  }

  async normalizeMerchant(raw: string, known: string[]): Promise<string> {
    return this.attempt('normalizeMerchant', (provider) =>
      provider.normalizeMerchant(raw, known),
    );
  }

  private async attempt<T>(
    operation: string,
    call: (provider: LlmPort) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (const [index, provider] of this.providers.entries()) {
      try {
        return await call(provider);
      } catch (error) {
        lastError = error;

        if (index === this.providers.length - 1) break;

        this.logger.warn('Provider failed, falling back', {
          operation,
          failed: provider.name,
          next: this.providers[index + 1]?.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw wrap(lastError, operation);
  }
}

function wrap(error: unknown, operation: string): LlmError {
  if (error instanceof LlmError) return error;

  return new LlmError(
    `Every LLM provider failed for ${operation}: ${
      error instanceof Error ? error.message : String(error)
    }`,
    false,
    error,
  );
}
