import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Direction, type RecurringRule } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { AppLogger } from '@/common/logger/app-logger.service';

import {
  detectRecurrences,
  nextOccurrence,
  type DetectedRecurrence,
} from './domain/detect';
import type {
  ConfirmRecurrenceDto,
  CreateRecurringDto,
  UpdateRecurringDto,
} from './dto/recurring.dto';

export interface RecurrenceSuggestion extends Omit<
  DetectedRecurrence,
  'typicalAmount'
> {
  typicalAmount: { amountMinor: number; currency: string };
  /** True once the user has accepted it — the suggestion is then a rule. */
  alreadyConfirmed: boolean;
}

/** A year is enough to see a yearly renewal twice; more is mostly noise. */
const LOOKBACK_DAYS = 400;

@Injectable()
export class RecurringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('Recurring');
  }

  /** Rules the user has actually accepted. */
  async list(profileId: string): Promise<RecurringRule[]> {
    return this.prisma.recurringRule.findMany({
      where: { profileId, enabled: true },
      orderBy: [{ nextDueDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Patterns found in history, offered as suggestions.
   *
   * Deliberately *not* auto-created as rules. A detected pattern that silently
   * started generating transactions would put rows in the ledger the user
   * never entered — the same thing the review queue exists to prevent for
   * parsed input. Detection proposes; the user disposes.
   */
  async detect(profileId: string): Promise<RecurrenceSuggestion[]> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

    const [transactions, confirmed] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          profileId,
          deletedAt: null,
          direction: Direction.DEBIT,
          date: { gte: since },
        },
        select: {
          id: true,
          merchantId: true,
          categoryId: true,
          accountId: true,
          amountMinor: true,
          date: true,
          merchant: { select: { normalizedName: true } },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.recurringRule.findMany({
        where: { profileId },
        select: { merchantId: true, categoryId: true, accountId: true },
      }),
    ]);

    const confirmedSignatures = new Set(
      confirmed.map((rule) =>
        rule.merchantId
          ? `merchant:${rule.merchantId}`
          : `category:${rule.categoryId ?? 'none'}:account:${rule.accountId ?? 'none'}`,
      ),
    );

    const detected = detectRecurrences(
      transactions.map((row) => ({
        id: row.id,
        merchantId: row.merchantId,
        merchantName: row.merchant?.normalizedName ?? null,
        categoryId: row.categoryId,
        accountId: row.accountId,
        amountMinor: row.amountMinor,
        date: row.date,
      })),
    );

    return detected.map((recurrence) => ({
      ...recurrence,
      typicalAmount: recurrence.typicalAmount.toJSON(),
      alreadyConfirmed: confirmedSignatures.has(recurrence.signature),
    }));
  }

  /**
   * Accepts a detected pattern as a rule.
   *
   * Re-derives it from history rather than trusting the client's numbers: the
   * request only names which pattern to accept, so a caller cannot invent a
   * ₹50,000 monthly rule that was never in the data.
   */
  async confirmDetected(
    profileId: string,
    dto: ConfirmRecurrenceDto,
  ): Promise<RecurringRule> {
    const suggestions = await this.detect(profileId);
    const match = suggestions.find((s) => s.signature === dto.signature);

    if (!match) {
      throw new NotFoundException(
        'That pattern is no longer visible in your history',
      );
    }

    if (match.alreadyConfirmed) {
      throw new BadRequestException('This recurrence is already set up');
    }

    const rule = await this.prisma.recurringRule.create({
      data: {
        profileId,
        merchantId: match.merchantId,
        categoryId: match.categoryId,
        accountId: match.accountId,
        amountMinor: BigInt(match.typicalAmount.amountMinor),
        direction: Direction.DEBIT,
        cadence: match.cadence,
        dayOfMonth: match.nextExpected.getUTCDate(),
        nextDueDate: match.nextExpected,
        autoDebit: dto.autoDebit ?? false,
        confidence: match.confidence,
        confirmed: true,
        enabled: true,
      },
    });

    // Labelled here rather than left to a second call. The payments that
    // revealed the pattern are the ones the user is looking at when they
    // accept it, and design 2e shows the pill on them — requiring an extra
    // round trip to make that true invites it being forgotten.
    const { labelled } = await this.labelMatchingTransactions(
      profileId,
      rule.id,
    );

    this.logger.log('Recurrence confirmed', {
      profileId,
      ruleId: rule.id,
      cadence: rule.cadence,
      labelled,
    });

    return rule;
  }

  /**
   * Creates a rule the user described, rather than one the detector found.
   *
   * Detection needs three occurrences, which is a quarter for anything
   * monthly — and income may never be detected at all if it is the only
   * credit on an account. Someone who knows their salary lands on the 1st
   * should be able to say so.
   *
   * `confidence` stays null on purpose: it means "the model's certainty",
   * and there was no model involved. A user-stated schedule is not a guess.
   */
  async createManual(
    profileId: string,
    dto: CreateRecurringDto,
  ): Promise<RecurringRule> {
    const rule = await this.prisma.recurringRule.create({
      data: {
        profileId,
        accountId: dto.accountId ?? null,
        categoryId: dto.categoryId ?? null,
        amountMinor: BigInt(dto.amountMinor),
        direction: dto.direction ?? Direction.DEBIT,
        cadence: dto.cadence,
        dayOfMonth: dto.dayOfMonth,
        nextDueDate: nextOccurrence(dto.cadence, dto.dayOfMonth),
        autoDebit: dto.autoDebit ?? false,
        confidence: null,
        // Stated by the user, so it is confirmed by definition — it never
        // passes through the suggestion stage.
        confirmed: true,
        enabled: true,
      },
    });

    this.logger.log('Recurrence created manually', {
      profileId,
      ruleId: rule.id,
      cadence: rule.cadence,
      direction: rule.direction,
    });

    return rule;
  }

  async update(
    profileId: string,
    ruleId: string,
    dto: UpdateRecurringDto,
  ): Promise<RecurringRule> {
    await this.findOwned(profileId, ruleId);

    return this.prisma.recurringRule.update({
      where: { id: ruleId },
      data: {
        ...(dto.amountMinor !== undefined
          ? { amountMinor: BigInt(dto.amountMinor) }
          : {}),
        ...(dto.cadence !== undefined ? { cadence: dto.cadence } : {}),
        ...(dto.nextDueDate !== undefined
          ? { nextDueDate: new Date(dto.nextDueDate) }
          : {}),
        ...(dto.autoDebit !== undefined ? { autoDebit: dto.autoDebit } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
  }

  async remove(profileId: string, ruleId: string): Promise<void> {
    await this.findOwned(profileId, ruleId);
    await this.prisma.recurringRule.delete({ where: { id: ruleId } });
  }

  /**
   * Marks transactions belonging to a confirmed rule.
   *
   * This is what puts the "Recurring" and "Auto-debit" pills on rows in
   * design 2e. Applied to history as well as to new entries, so accepting a
   * rule immediately labels the payments that revealed it rather than only
   * future ones.
   */
  async labelMatchingTransactions(
    profileId: string,
    ruleId: string,
  ): Promise<{ labelled: number }> {
    const rule = await this.findOwned(profileId, ruleId);

    const result = await this.prisma.transaction.updateMany({
      where: {
        profileId,
        deletedAt: null,
        recurringRuleId: null,
        ...(rule.merchantId
          ? { merchantId: rule.merchantId }
          : { categoryId: rule.categoryId, accountId: rule.accountId }),
      },
      data: { recurringRuleId: rule.id },
    });

    return { labelled: result.count };
  }

  private async findOwned(
    profileId: string,
    ruleId: string,
  ): Promise<RecurringRule> {
    const rule = await this.prisma.recurringRule.findUnique({
      where: { id: ruleId },
    });

    if (rule?.profileId !== profileId) {
      throw new NotFoundException('Recurring rule not found');
    }

    return rule;
  }
}
