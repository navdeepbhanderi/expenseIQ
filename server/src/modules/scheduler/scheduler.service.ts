import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import type { AppConfig } from '@/config/configuration';
import { RecurrenceGeneratorService } from '@/modules/recurring/recurrence-generator.service';
import { RemindersService } from '@/modules/reminders/reminders.service';
import { StatementGeneratorService } from '@/modules/accounts/statement-generator.service';

/**
 * The daily jobs.
 *
 * Both `generate-due` and the reminder scan were endpoints waiting for a
 * caller that did not exist, which meant a rule could come due and nothing
 * happened until someone pressed a button. A scheduled expense tracker that
 * only works when you remember to poke it is not a scheduled expense tracker.
 *
 * Both underlying operations are already idempotent - recurrence generation is
 * keyed on (rule, due date) behind a partial unique index, and the reminder
 * scan is keyed on the billing cycle - so a double run, a restart mid-job, or
 * a manual trigger racing the cron all collapse to the same result. That is
 * what makes running this on a timer safe rather than merely convenient.
 */
@Injectable()
export class SchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: RecurrenceGeneratorService,
    private readonly reminders: RemindersService,
    private readonly statements: StatementGeneratorService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('Scheduler');
  }

  /**
   * 02:00 local, because both jobs write notifications and staging entries.
   *
   * Early enough that a due date is surfaced on the morning of, late enough
   * that it is not competing with anything a user is doing. The reminder's own
   * `timeOfDay` decides when a person is actually told; this only decides when
   * the work is prepared.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'daily-recurrence' })
  async runDaily(): Promise<void> {
    // Tests boot the whole app; a cron firing mid-suite would write rows the
    // test never asked for and make failures depend on the clock.
    if (this.config.get<AppConfig['isTest']>('isTest')) return;

    const profiles = await this.prisma.profile.findMany({
      select: { id: true },
    });

    let generated = 0;
    let reminded = 0;
    let statements = 0;
    let failed = 0;

    for (const { id } of profiles) {
      /*
       * Per profile, not one big transaction.
       *
       * One profile with bad data must not stop every other household's rent
       * from being staged, so each is isolated and a failure is logged and
       * stepped over rather than thrown.
       */
      try {
        const due = await this.generator.generateDue(id);
        generated += due.generated;
      } catch (error) {
        failed += 1;
        this.logger.error('Recurrence generation failed', undefined, {
          profileId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      /*
       * Statements before reminders, deliberately.
       *
       * A reminder quotes the open statement, so the bill has to exist before
       * anything tries to tell the user about it — otherwise a card whose
       * statement day is today would be reminded about last month's.
       */
      try {
        const run = await this.statements.run(id);
        statements += run.generated;
      } catch (error) {
        failed += 1;
        this.logger.error('Statement generation failed', undefined, {
          profileId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        const run = await this.reminders.runScan(id);
        reminded += run.fired;
      } catch (error) {
        failed += 1;
        this.logger.error('Reminder scan failed', undefined, {
          profileId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log('Daily run complete', {
      profiles: profiles.length,
      generated,
      statements,
      reminded,
      failed,
    });
  }
}
