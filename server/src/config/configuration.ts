import type { Env } from './env.validation';

/**
 * Shapes the flat env into nested, typed config namespaces.
 *
 * Modules depend on these groupings rather than reading process.env directly,
 * so a rename of an env var touches this file only.
 */
export const configuration = (): AppConfig => {
  const env = process.env as unknown as Env;

  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    port: Number(env.PORT),
    appUrl: env.APP_URL,
    webUrl: env.WEB_URL,

    database: {
      url: env.DATABASE_URL,
    },
    redis: {
      url: env.REDIS_URL,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    mail: {
      from: env.MAIL_FROM,
      resendApiKey: env.RESEND_API_KEY,
    },
    // Model IDs are pinned per task here and never hardcoded at call sites,
    // so the Pro/Flash routing split stays a config decision.
    llm: {
      apiKey: env.GEMINI_API_KEY,
      models: {
        pro: env.GEMINI_MODEL_PRO,
        flash: env.GEMINI_MODEL_FLASH,
      },
      thinkingBudget: Number(env.GEMINI_THINKING_BUDGET),
    },
  };
};

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  isTest: boolean;
  port: number;
  appUrl: string;
  webUrl: string;
  database: { url: string };
  redis: { url: string };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  google: { clientId?: string; clientSecret?: string };
  mail: { from: string; resendApiKey?: string };
  llm: {
    apiKey?: string;
    models: { pro: string; flash: string };
    thinkingBudget: number;
  };
}
