import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * The one place the HTTP pipeline is configured.
 *
 * Both `main.ts` and the integration-test harness call this, rather than each
 * setting up its own prefix, pipes and middleware. That is not tidiness — it's
 * correctness: when the two drift, tests stop describing production. It has
 * already bitten once here, when `cookieParser()` lived only in main.ts and
 * every cookie-based refresh silently failed under test while working in the
 * real app.
 *
 * Anything that changes how a request is parsed, validated or routed belongs
 * here. Things that are genuinely bootstrap-only — Swagger, `listen()` — stay
 * in main.ts.
 */
export function configureApp(
  app: INestApplication,
  options: { corsOrigin?: string } = {},
): INestApplication {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // The refresh token lives in an httpOnly cookie, so it has to be parsed
  // before any route can read it.
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      // Strips properties with no matching DTO decorator. Without this, a
      // client could POST { role: 'OWNER' } at an endpoint that never meant
      // to accept it and have it reach the ORM.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (options.corsOrigin) {
    app.enableCors({ origin: options.corsOrigin, credentials: true });
  }

  return app;
}
