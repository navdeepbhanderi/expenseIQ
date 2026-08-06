// Side-effect import: installs BigInt JSON serialisation before anything can
// return a money field. Must be first — see the module for why it isn't in main.ts.
import './common/money/bigint-serializer';

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [configuration],
      cache: true,
    }),

    // A baseline ceiling on every route. Auth and NLU endpoints will tighten
    // this with their own @Throttle — NLU because each call costs money.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),

    LoggerModule,
    PrismaModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applied to '*' rather than to routes, so unmatched paths get an id too.
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
