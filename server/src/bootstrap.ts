import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

interface BodyParserCapable {
  useBodyParser(type: string, options: Record<string, unknown>): unknown;
}

/**
 * `configureApp` takes an INestApplication so the test harness and main.ts can
 * share it, but body-parser configuration is an Express-adapter capability.
 * Checked rather than cast, so swapping to Fastify degrades to "no explicit
 * limit" instead of a runtime crash.
 */
function hasBodyParser(app: unknown): app is BodyParserCapable {
  return typeof (app as BodyParserCapable).useBodyParser === 'function';
}

/**
 * Generous for a JSON API, tight enough to matter. The largest legitimate
 * body is a bulk-confirm of review items; receipts do not come through here
 * (multipart has its own limit in ReceiptsController). Express defaults to
 * 100kb, which is nearly right, but leaving it implicit means it changes
 * under us if Express ever revises the default.
 */
const MAX_JSON_BYTES = '256kb';

/**
 * The one place the HTTP pipeline is configured.
 *
 * Both `main.ts` and the integration-test harness call this, rather than each
 * setting up its own prefix, pipes and middleware. That is not tidiness - it's
 * correctness: when the two drift, tests stop describing production. It has
 * already bitten once here, when `cookieParser()` lived only in main.ts and
 * every cookie-based refresh silently failed under test while working in the
 * real app.
 *
 * Anything that changes how a request is parsed, validated or routed belongs
 * here. Things that are genuinely bootstrap-only - Swagger, `listen()` - stay
 * in main.ts.
 */
export function configureApp(
  app: INestApplication,
  options: { corsOrigin?: string } = {},
): INestApplication {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Security headers. contentSecurityPolicy is off because this process
  // serves JSON, not documents - the one HTML surface is Swagger UI in
  // development, which a default CSP breaks (it needs inline scripts). Every
  // header that actually protects an API client - nosniff, frameguard,
  // HSTS, referrer policy - stays on.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Explicit body ceiling. Without one, a request body is bounded only by
  // whatever the framework happens to default to, and the validation pipe
  // only runs *after* the whole body has been parsed into memory.
  //
  // useBodyParser, not app.use(express.json()) - Nest registers its own parser
  // during create(), so an added one never sees an unparsed body and silently
  // does nothing. This reconfigures the parser that actually runs.
  if (hasBodyParser(app)) {
    app.useBodyParser('json', { limit: MAX_JSON_BYTES });
    app.useBodyParser('urlencoded', { extended: true, limit: MAX_JSON_BYTES });
  }

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
