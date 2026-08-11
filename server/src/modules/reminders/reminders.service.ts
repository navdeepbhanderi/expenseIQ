import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountType,
  NotificationSeverity,
  ReminderChannel,
  type Account,
  type Reminder,
} from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { MailerService } from '@/infra/mailer/mailer.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import { Money } from '@/common/money/money';
import { computeBillingCycle } from '@/modules/accounts/domain/billing-cycle';
import { summariseLoan } from '@/modules/accounts/domain/amortization';
import { loanTermsFrom } from '@/modules/accounts/domain/loan-terms';
import {
  NOTIFICATION_KINDS,
  NotificationsService,
} from '@/modules/notifications/notifications.service';

import { decideReminder, type ReminderKind } from './domain/schedule';
import type { SetReminderDto } from './dto/reminder.dto';

export interface ReminderRun {
  scanned: number;
  fired: number;
  skipped: number;
}

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('Reminders');
  }

  async forAccount(profileId: string, accountId: string): Promise<Reminder[]> {
    await this.assertAccount(profileId, accountId);
    return this.prisma.reminder.findMany({ where: { accountId } });
  }

  /**
   * Replaces the reminder for an account.
   *
   * `lastFiredCycle` is deliberately preserved across an edit. The spec is
   * explicit: changing the settings after a reminder has already gone out for
   * this cycle must not cause a second one. Clearing it here would do exactly
   * that, and the user would get a duplicate every time they nudged the offset.
   */
  async set(
    profileId: string,
    accountId: string,
    dto: SetReminderDto,
  ): Promise<Reminder> {
    await this.assertAccount(profileId, accountId);

    const existing = await this.prisma.reminder.findFirst({
      where: { accountId },
    });

    /*
     * An omitted field keeps what is already there, and only falls back to a
     * default when there is nothing to keep.
     *
     * Every field is optional, and the UI sends one at a time - switching the
     * reminder off is `{ enabled: false }` on its own. Filling the gaps with
     * defaults instead of the stored values meant that turning it off silently
     * reset "a week before, 8 pm" to "3 days before, 9 am", and turning it
     * back on produced a schedule the user never chose.
     */
    const data = {
      offsetDays: dto.offsetDays ?? existing?.offsetDays ?? 3,
      timeOfDay: dto.timeOfDay ?? existing?.timeOfDay ?? 540,
      channels: dto.channels ?? existing?.channels ?? [ReminderChannel.EMAIL],
      enabled: dto.enabled ?? existing?.enabled ?? true,
    };

    if (existing) {
      return this.prisma.reminder.update({ where: { id: existing.id }, data });
    }

    return this.prisma.reminder.create({ data: { accountId, ...data } });
  }

  async remove(profileId: string, accountId: string): Promise<void> {
    await this.assertAccount(profileId, accountId);
    await this.prisma.reminder.deleteMany({ where: { accountId } });
  }

  /**
   * The daily scan.
   *
   * Walks every enabled reminder, works out whether this cycle's notification
   * is due, and records the cycle it fired for so a second run the same day -
   * or a retried job - sends nothing.
   *
   * Scoped to one profile so it can be triggered per user in a test or an
   * endpoint; the scheduler will fan out across profiles.
   */
  async runScan(profileId: string, now = new Date()): Promise<ReminderRun> {
    const reminders = await this.prisma.reminder.findMany({
      where: { enabled: true, account: { profileId, closedAt: null } },
      include: { account: true },
    });

    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        locale: true,
        members: { select: { user: { select: { email: true } } } },
      },
    });

    let fired = 0;
    let skipped = 0;

    for (const reminder of reminders) {
      const due = this.dueFor(reminder.account, now);

      if (!due) {
        skipped += 1;
        continue;
      }

      const decision = decideReminder({
        dueDate: due.dueDate,
        offsetDays: reminder.offsetDays,
        timeOfDay: reminder.timeOfDay,
        timezone: timezoneFor(profile?.locale),
        lastFiredCycle: reminder.lastFiredCycle,
        now,
      });

      if (!decision.fire) {
        skipped += 1;
        continue;
      }

      await this.deliver({
        profileId,
        reminder,
        account: reminder.account,
        amount: due.amount,
        dueDate: due.dueDate,
        kind: decision.kind,
        daysUntilDue: decision.daysUntilDue,
        recipients: profile?.members.map((m) => m.user.email) ?? [],
      });

      // Written after delivery, not before. If the process dies mid-send the
      // reminder is retried - a duplicate notification is a far smaller
      // failure than a missed bill.
      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { lastFiredCycle: decision.cycleKey },
      });

      fired += 1;
    }

    if (fired > 0) {
      this.logger.log('Reminder scan complete', {
        profileId,
        scanned: reminders.length,
        fired,
      });
    }

    return { scanned: reminders.length, fired, skipped };
  }

  /** What this account owes next, if anything. */
  private dueFor(
    account: Account,
    now: Date,
  ): { dueDate: Date; amount: Money } | null {
    if (
      account.type === AccountType.CREDIT_CARD &&
      account.statementDay !== null &&
      account.dueDay !== null
    ) {
      const outstanding = Money.fromBigInt(account.balanceMinor).abs();

      // A settled card has nothing to remind about.
      if (!outstanding.isPositive) return null;

      const cycle = computeBillingCycle({
        statementDay: account.statementDay,
        dueDay: account.dueDay,
        asOf: now,
      });

      return { dueDate: cycle.dueDate, amount: outstanding };
    }

    if (account.type === AccountType.LOAN) {
      const terms = loanTermsFrom(account);
      if (!terms) return null;

      try {
        const summary = summariseLoan(terms, account.emisPaid ?? 0);
        if (!summary.nextEmiDate) return null;
        return { dueDate: summary.nextEmiDate, amount: summary.emi };
      } catch {
        return null;
      }
    }

    return null;
  }

  private async deliver(input: {
    profileId: string;
    reminder: Reminder;
    account: Account;
    amount: Money;
    dueDate: Date;
    kind: ReminderKind;
    daysUntilDue: number;
    recipients: string[];
  }): Promise<void> {
    const { account, amount, kind, daysUntilDue } = input;
    const rupees = amount.toMajor().toLocaleString('en-IN');

    const title =
      kind === 'overdue'
        ? `${account.name} is ${Math.abs(daysUntilDue)} days overdue`
        : daysUntilDue === 0
          ? `${account.name} is due today`
          : `${account.name} due in ${daysUntilDue} days`;

    const body =
      kind === 'overdue'
        ? `₹${rupees} was due on ${input.dueDate.toISOString().slice(0, 10)}.`
        : `₹${rupees} due on ${input.dueDate.toISOString().slice(0, 10)}.`;

    const channels = input.reminder.channels;

    // In-app always. It is free, it is the surface design 6e renders, and a
    // reminder the user can see when they next open the app is the baseline
    // every other channel builds on.
    await this.notifications.raise({
      profileId: input.profileId,
      kind:
        kind === 'overdue'
          ? NOTIFICATION_KINDS.overdue
          : NOTIFICATION_KINDS.dueSoon,
      title,
      body,
      severity:
        kind === 'overdue'
          ? NotificationSeverity.ERROR
          : NotificationSeverity.WARNING,
      payload: {
        accountId: account.id,
        amountMinor: amount.minor,
        dueDate: input.dueDate.toISOString(),
        daysUntilDue,
      },
      // Cycle-scoped, so a re-run cannot stack a second banner.
      dedupeKey: `${account.id}:${input.dueDate.toISOString().slice(0, 10)}:${kind}`,
    });

    if (channels.includes(ReminderChannel.EMAIL)) {
      for (const to of input.recipients) {
        await this.mailer.send({
          to,
          subject: title,
          text: `${body}\n\nOpen ExpenseIQ to review and mark it paid.`,
        });
      }
    }

    // PUSH, CALENDAR and TASKS are recorded as requested but not delivered
    // here - they need a device token and Google OAuth respectively, and are
    // wired through the integrations module.
  }

  private async assertAccount(
    profileId: string,
    accountId: string,
  ): Promise<Account> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (account?.profileId !== profileId) {
      throw new NotFoundException('Account not found');
    }

    return account;
  }
}

/**
 * India-first: `en-IN` and anything unrecognised map to Asia/Kolkata.
 *
 * A profile-level timezone column would be more correct, but the locale is
 * what the design actually collects, and every user of this product is in one
 * zone. Worth revisiting the day that stops being true.
 */
function timezoneFor(locale: string | undefined): string {
  const zones: Record<string, string> = {
    'en-IN': 'Asia/Kolkata',
    'hi-IN': 'Asia/Kolkata',
    'gu-IN': 'Asia/Kolkata',
    'en-US': 'America/New_York',
    'en-GB': 'Europe/London',
  };

  return zones[locale ?? ''] ?? 'Asia/Kolkata';
}
