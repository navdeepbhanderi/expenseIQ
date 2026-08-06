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
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_PRO: z.string().default('gemini-2.5-pro'),
  GEMINI_MODEL_FLASH: z.string().default('gemini-2.5-flash'),
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
