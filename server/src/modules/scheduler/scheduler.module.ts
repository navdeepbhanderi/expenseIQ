import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { RecurringModule } from '@/modules/recurring/recurring.module';
import { RemindersModule } from '@/modules/reminders/reminders.module';
import { AccountsModule } from '@/modules/accounts/accounts.module';
import { SchedulerService } from './scheduler.service';

/**
 * Owns the app's only cron.
 *
 * A module of its own so the jobs are findable in one place, rather than a
 * @Cron hidden inside whichever service happened to need it first.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    RecurringModule,
    RemindersModule,
    AccountsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
