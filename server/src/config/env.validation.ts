import { z } from 'zod';

/**
 * Environment contract, validated once at boot.
 *
 * The point of failing here rather than at first use: a missing DATABASE_URL
 * should kill the process on startup, not surface as a confusing 500 on the
 * first request that happens to touch the database.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url(),
  WEB_URL: z.url(),

  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1),

  // Rejecting short secrets at boot is cheap and stops a placeholder value
  // from silently becoming the production signing key.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  MAIL_FROM: z.string().default('ExpenseIQ <no-reply@expenseiq.local>'),
  RESEND_API_KEY: z.string().optional(),

  // Optional until Phase 4 so the app boots without an LLM key while the
  // core CRUD phases are being built. NluModule asserts it at init.
  // Comma-separated fallback chains, strongest first - see DEFAULT_CHAINS in
  // gemini.adapter.ts for why a chain rather than one model. Left empty, the
  // adapter's own defaults apply.
  //
  // Both default to Flash models, not Pro: every Pro model has a free-tier
  // quota of zero, so an unbilled project gets 429 on every extraction. Put
  // gemini-3.1-pro-preview at the head of the pro chain once billing is on.
  // Gemini 2.5 spends "thinking" tokens before answering, billed as output and
  // counted against maxOutputTokens. Measured on the hardest extraction case
  // here, thinking cost 610 tokens and 2.1 extra seconds for an identical
  // result - against a design that budgets about four seconds for the whole
  // speak-to-confirmed flow. Raise it if extraction quality ever needs it.

  /*
   * Groq - the platform default.
   *
   * Chosen for the free tier's shape rather than for raw quality:
   * llama-3.1-8b-instant allows 14,400 requests a day at 30/minute, where
   * OpenRouter's free tier is 50/day per account and Gemini's is roughly
   * 20/day per model. For a product whose core interaction is "say a
   * sentence, get a parse", a daily cap measured in tens is not a free tier,
   * it is a demo. Groq also serves an 8B model fast enough for the design's
   * four-second budget.
   */
  /**
   * Encrypts user-supplied provider keys at rest. `openssl rand -hex 32`.
   *
   * Optional so the app still boots without it - the bring-your-own-key
   * feature is then simply unavailable rather than the whole server refusing
   * to start over a feature most deployments will not use.
   */
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters')
    .optional(),

  GROQ_API_KEY: z.string().optional(),
  GROQ_MODELS_TEXT: z.string().optional(),
  // Llama 3.1 8B has no vision. Receipts fall through to a provider that does.
  GROQ_MODELS_VISION: z.string().optional(),
  GROQ_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20_000),

  // Comma-separated chains, same convention as the Gemini ones. Left empty,
  // the adapter's measured defaults apply - see groq.adapter.ts.
  // Receipts. Must be a model that does BOTH vision and structured output,
  // which on the free tier is a much shorter list than either alone.
  /**
   * How long one OpenRouter model gets before the adapter abandons it for the
   * next in the chain.
   *
   * This exists because of a measured failure, not a hypothetical. Free-tier
   * capacity is contended: a model that answered in 280-405ms in isolation
   * later sat in a queue until OpenRouter's own upstream idle timeout fired
   * at ~120 seconds, turning a two-second parse into a two-MINUTE one. With
   * no deadline of our own we inherit theirs, and the user watches a spinner
   * for all of it.
   *
   * Twelve seconds is well past any healthy response and far short of a wait
   * anyone tolerates, so a contended model costs one short pause rather than
   * dominating the request.
   */
});

export type Env = z.infer<typeof envSchema>;

/** Passed to ConfigModule.forRoot({ validate }). */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}
