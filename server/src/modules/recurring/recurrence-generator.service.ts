import { Injectable } from '@nestjs/common';
import {
  Cadence,
  ConfidenceBand,
  ReviewStatus,
  TransactionSource,
  type RecurringRule,
} from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { AppLogger } from '@/common/logger/app-logger.service';

/**
 * Turns a due recurring rule into a pending review-queue entry.
 *
 * **Why the review queue rather than straight into the ledger.**
 *
 * The tempting argument is that a confirmed rule is the user's own
 * instruction, not an AI guess, so executing it needs no further consent.
 * That holds for the *schedule* but not for the *amount*: the single most
 * common recurring payment in this product's own design is an electricity
 * bill, and design 2e shows it varying between ₹1,890 and ₹3,120. Writing a
 * predicted amount straight into the ledger would silently record a number
 * nobody has seen, and every downstream total — budgets, norms, net worth —
 * would inherit it.
 *
 * So generated entries land in the review queue like everything else. What
 * makes that cheap rather than tedious: they arrive fully pre-filled, and a
 * rule whose amount barely moves is marked CLEAR so it is one-tap
 * confirmable. A stable ₹649 subscription costs the user a single tap; a
 * variable utility bill asks them to glance at the figure, which is exactly
 * where a glance is worth something.
 */
@Injectable()
export class RecurrenceGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('RecurrenceGenerator');
  }

  /**
   * Stages every rule that has come due, and advances its schedule.
   *
   * Idempotent per rule per due date via `sourceRefId`, backed by the partial
   * unique index on (source, sourceRefId). A scheduler that fires twice — or
   * a retried job — cannot produce two entries for the same month, which is
   * the failure mode that would quietly double someone's recorded spending.
   */
  async generateDue(
    profileId: string,
    asOf = new Date(),
  ): Promise<{ generated: number; skipped: number }> {
    const due = await this.prisma.recurringRule.findMany({
      where: {
        profileId,
        enabled: true,
        confirmed: true,
        nextDueDate: { not: null, lte: asOf },
      },
      include: { merchant: { select: { normalizedName: true } } },
    });

    let generated = 0;
    let skipped = 0;

    for (const rule of due) {
      const dueDate = rule.nextDueDate;
      if (!dueDate) continue;

      /*
       * Past its end date — retire it without staging.
       *
       * Checked before staging rather than after, because a rule that ran to
       * its final date should not produce one entry beyond it. A lease that
       * ends in December must not stage a January rent.
       */
      if (rule.endsOn && dueDate > rule.endsOn) {
        await this.retire(rule.id);
        continue;
      }

      const created = await this.stage(rule, dueDate);
      if (created) generated += 1;
      else skipped += 1;

      // Only a genuinely new entry counts. A re-run that hit the idempotency
      // index has not consumed an instalment, and counting it would end a
      // 12-EMI loan early.
      const count = rule.occurrenceCount + (created ? 1 : 0);

      /*
       * Exhausted its instalments — this was the last one.
       *
       * The entry just staged is kept; it is the final EMI, not one too many.
       */
      if (rule.maxOccurrences !== null && count >= rule.maxOccurrences) {
        await this.retire(rule.id, count);
        continue;
      }

      const next = advance(dueDate, rule.cadence, rule.dayOfMonth);

      // The next landing is past the end date, so there is nothing further to
      // schedule. Retiring here rather than waiting for the next run means the
      // UI stops showing a due date the rule will never reach.
      if (rule.endsOn && next > rule.endsOn) {
        await this.retire(rule.id, count);
        continue;
      }

      // Advanced regardless of whether an entry was created. A rule whose
      // entry already existed has simply been generated before; leaving
      // nextDueDate in the past would make it due forever and the scheduler
      // would revisit it on every run.
      await this.prisma.recurringRule.update({
        where: { id: rule.id },
        data: { nextDueDate: next, occurrenceCount: count },
      });
    }

    if (generated > 0 || skipped > 0) {
      this.logger.log('Generated recurring entries', {
        profileId,
        generated,
        skipped,
      });
    }

    return { generated, skipped };
  }

  /**
   * Ends a rule that has run its course.
   *
   * `enabled: false` rather than deleting: the user's history of what they
   * were paying is worth keeping, and a finished loan reappearing as "never
   * existed" is worse than one shown as done. `nextDueDate: null` takes it
   * out of the due query for good.
   */
  private async retire(id: string, occurrenceCount?: number): Promise<void> {
    await this.prisma.recurringRule.update({
      where: { id },
      data: {
        enabled: false,
        nextDueDate: null,
        ...(occurrenceCount === undefined ? {} : { occurrenceCount }),
      },
    });
  }

  private async stage(
    rule: RecurringRule & { merchant: { normalizedName: string } | null },
    dueDate: Date,
  ): Promise<boolean> {
    // One entry per rule per due date, enforced at the database.
    const sourceRefId = `${rule.id}:${dueDate.toISOString().slice(0, 10)}`;

    const existing = await this.prisma.reviewQueueItem.findFirst({
      where: { source: TransactionSource.RECURRING, sourceRefId },
      select: { id: true },
    });

    if (existing) return false;

    // A rule the user accepted with a steady amount needs no scrutiny; one
    // whose amount moves does. `confidence` here describes the *prediction*,
    // not a model's opinion.
    const band =
      rule.confidence !== null && rule.confidence >= 0.9
        ? ConfidenceBand.CLEAR
        : ConfidenceBand.FAIRLY_SURE;

    try {
      await this.prisma.reviewQueueItem.create({
        data: {
          profileId: rule.profileId,
          parsedAmountMinor: rule.amountMinor,
          parsedDirection: rule.direction,
          parsedCategoryId: rule.categoryId,
          parsedAccountId: rule.accountId,
          parsedMerchant: rule.merchant?.normalizedName ?? null,
          parsedDate: dueDate,
          parsedNote: null,
          confidence: rule.confidence,
          confidenceBand: band,
          // Nothing is missing — the rule supplied every field, which is what
          // makes these one-tap.
          missingFields: [],
          suggestedAccountIds: [],
          status: ReviewStatus.PENDING,
          source: TransactionSource.RECURRING,
          sourceRefId,
        },
      });

      return true;
    } catch {
      // Lost a race with a concurrent run; the unique index did its job.
      return false;
    }
  }
}

/**
 * The next occurrence.
 *
 * Calendar-aware rather than a fixed number of days: a monthly bill due on
 * the 31st must land on the 28th in February and recover to the 31st in
 * March, exactly as credit-card statement dates do. Adding 30 days would
 * drift the date earlier every month until a "monthly" bill fell twice in
 * one month.
 */
export function advance(
  from: Date,
  cadence: Cadence,
  /**
   * The day the rule actually asks for, when it differs from the day it last
   * landed on.
   *
   * Without it the next date is derived from the previous *clamped* one, so a
   * rule due on the 31st lands on 28 February and then advances to 28 March —
   * and stays on the 28th forever. Recovering to the 31st needs the original
   * intent, not the compromise February forced.
   */
  anchorDay: number | null = null,
): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();

  /*
   * The anchor only *recovers* from a clamp — it never overrides a date.
   *
   * A due date sitting on the last day of a month that is shorter than the
   * day the rule asks for is a compromise February imposed, so the next one
   * goes back to the real day. Any other due date was either never clamped or
   * was deliberately moved (the PATCH endpoint allows exactly that), and
   * quietly dragging it back to the rule's day would undo the user's edit.
   */
  const lastOfThisMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const wasClamped =
    anchorDay !== null &&
    from.getUTCDate() === lastOfThisMonth &&
    anchorDay > lastOfThisMonth;

  const day = wasClamped ? anchorDay : from.getUTCDate();

  switch (cadence) {
    case Cadence.WEEKLY:
      return new Date(from.getTime() + 7 * 86_400_000);
    case Cadence.MONTHLY:
      return clampToMonth(year, month + 1, day);
    case Cadence.QUARTERLY:
      return clampToMonth(year, month + 3, day);
    case Cadence.YEARLY:
      return clampToMonth(year + 1, month, day);
  }
}

function clampToMonth(year: number, month: number, day: number): Date {
  const anchor = new Date(Date.UTC(year, month, 1));
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}
