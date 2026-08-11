/**
 * Deciding when to give up on a model and try the next one.
 *
 * Pure, and separate from the adapter, because the interesting behaviour here
 * is error classification - and classifying an error should be testable
 * without a Gemini client, an API key, or a network.
 */

/**
 * Model chains, strongest first. Config overrides these; a comma-separated
 * list in GEMINI_MODEL_PRO/FLASH sets the whole chain.
 *
 * Fallback exists because Google's free tier meters each model separately.
 * Exhausting one model's daily quota does not touch the next one's, so a chain
 * is the difference between "the feature stopped working at 4pm" and "the
 * feature got slightly dumber at 4pm". Measured: gemini-2.5-flash returned 429
 * quota-exceeded while gemini-3.5-flash on the same key kept answering.
 */
export const DEFAULT_CHAINS: Record<'pro' | 'flash', readonly string[]> = {
  pro: ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-2.5-flash'],
  flash: ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash'],
};

/** Parses a configured chain; falls back to the built-in one when unset. */
export function resolveChain(
  configured: string | undefined,
  tier: 'pro' | 'flash',
): string[] {
  // Comma-separated so a chain is configurable without a new env var per
  // rung. A single model name is just a chain of one.
  const chain = (configured ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return chain.length > 0 ? chain : [...DEFAULT_CHAINS[tier]];
}

/**
 * Would a different model plausibly succeed where this one just failed?
 *
 * 429 is the common case and the reason this exists: free-tier quota is
 * per-model, so the next rung has its own untouched budget. 404 covers a model
 * name this key cannot see. 400 covers a parameter the model refuses. 5xx is
 * capacity, which differs per model. Everything else - 401, 403, our own
 * malformed request - fails the same way on every rung, so walking the chain
 * would just multiply the latency of a guaranteed failure.
 */
export function isWorthAnotherModel(error: unknown): boolean {
  const status = statusOf(error);
  if (status === null) {
    return false;
  }

  return (
    status === 429 ||
    status === 404 ||
    status === 400 ||
    (status >= 500 && status < 600)
  );
}

/**
 * Might this 400 be the model refusing `thinkingConfig`?
 *
 * Any 400 counts, not just one naming the parameter, because Google does not
 * name it. gemini-3.6-flash rejects thinkingConfig with the entirely generic
 * "Request contains an invalid argument." - matching on the word "thinking"
 * looked precise and never once fired against the real API.
 *
 * So the test is deliberately broad: thinkingConfig is the only optional
 * parameter this adapter sends that a model can reject, which makes it the
 * prime suspect for any 400. The cost of being wrong is one retry that fails
 * the same way before the chain moves on; the cost of being too narrow is
 * losing a working model entirely.
 */
export function isThinkingConfigRejection(error: unknown): boolean {
  return statusOf(error) === 400;
}

/** Digs the HTTP status out of whatever shape @google/genai threw. */
export function statusOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { status?: unknown; code?: unknown };
    for (const value of [candidate.status, candidate.code]) {
      if (typeof value === 'number') {
        return value;
      }
    }
  }

  // The SDK often throws a plain Error whose message embeds the JSON error
  // body, so the status is only reachable as text. Matched only in
  // status-shaped positions - a bare \d{3} would happily read the "300" out
  // of "300 रुपये किराने पे" when the failing request is echoed back.
  const match =
    /"code"\s*:\s*([1-5]\d\d)|\bstatus[:=\s]\s*([1-5]\d\d)\b|^\s*\[?([1-5]\d\d)\b/i.exec(
      error instanceof Error ? error.message : '',
    );
  const digits = match?.[1] ?? match?.[2] ?? match?.[3];

  return digits === undefined ? null : Number(digits);
}
