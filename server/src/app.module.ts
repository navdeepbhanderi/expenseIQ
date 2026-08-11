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
import { MailerModule } from './infra/mailer/mailer.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

import { HealthModule } from './modules/health/health.module';
import { AccessModule } from './modules/access/access.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { LlmModule } from './infra/llm/llm.module';
import { NluModule } from './modules/nlu/nlu.module';
import { ReviewQueueModule } from './modules/review-queue/review-queue.module';
import { ReportsModule } from './modules/reports/reports.module';
import { QueueModule } from './infra/queue/queue.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { RecurringModule } from './modules/recurring/recurring.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { LlmSettingsModule } from './modules/llm-settings/llm-settings.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { FamilyModule } from './modules/family/family.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [configuration],
      cache: true,
    }),

    // A baseline ceiling on every route. Auth tightens this to 10/min with its
    // own @Throttle, and NLU will do the same in Phase 4 — each call costs money.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),

    LoggerModule,
    PrismaModule,
    MailerModule,
    LlmModule,
    QueueModule,
    AccessModule,

    HealthModule,
    AuthModule,
    ProfilesModule,
    CategoriesModule,
    AccountsModule,
    MerchantsModule,
    TransactionsModule,
    DashboardModule,
    BudgetsModule,
    NluModule,
    ReviewQueueModule,
    ReportsModule,
    ReceiptsModule,
    RecurringModule,
    NotificationsModule,
    RemindersModule,
    LlmSettingsModule,
    SchedulerModule,
    FamilyModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Authentication is global and opt-out via @Public(), so a route that
    // forgets its decorator is locked rather than exposed.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
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
