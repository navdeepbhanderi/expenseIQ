import { Injectable } from '@nestjs/common';
import { AccountType, StatementStatus } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import { startOfDay } from '@/common/time/calendar';
import { computeBillingCycle } from './domain/billing-cycle';

/**
 * Turns a billing cycle into a statement the user actually owes.
 *
 * Runs nightly. On a card's statement day it snapshots what was spent in the
 * cycle just ended, adds anything still unpaid from before, and opens a
 * statement due on the card's due date. From that moment the amount is fixed:
 * purchases made the next morning belong to the following cycle, which is the
 * distinction the product previously could not express at all.
 *
 * **Why snapshot rather than compute on read.** A statement is a historical
 * fact — the issuer billed a specific number on a specific day. Recomputing it
 * from current transactions would make last month's bill change every time an
 * old entry was edited, and would let a reminder quote a figure that had
 * already moved by the time the email arrived.
 *
 * Idempotent through a unique index on (accountId, statementDate), so a double
 * run, a retry, or a manual trigger racing the cron all collapse to one row.
 */
@Injectable()
export class StatementGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('StatementGenerator');
  }

  /**
   * Generates any statement that has come due, and ages the overdue ones.
   *
   * Both halves run every night because they are the same fact from two
   * sides: a cycle that has ended becomes a bill, and a bill whose date has
   * passed unpaid becomes overdue.
   */
  async run(
    profileId: string,
    asOf = new Date(),
  ): Promise<{ generated: number; overdue: number }> {
    const cards = await this.prisma.account.findMany({
      where: {
        profileId,
        type: AccountType.CREDIT_CARD,
        closedAt: null,
        statementDay: { not: null },
        dueDay: { not: null },
      },
    });

    let generated = 0;

    for (const card of cards) {
      const cycle = computeBillingCycle({
        statementDay: card.statementDay!,
        dueDay: card.dueDay!,
        asOf,
      });

      /*
       * Only once the statement date has actually arrived.
       *
       * `lastStatementDate` is the most recent occurrence on or before today,
       * so this is true from the statement day onwards — never early.
       */
      if (startOfDay(cycle.lastStatementDate) > startOfDay(asOf)) continue;

      const created = await this.generateFor(
        card.id,
        cycle.lastStatementDate,
        cycle.dueDate,
        card.minDuePercent,
      );

      if (created) generated += 1;
    }

    /*
     * An open statement past its due date is overdue.
     *
     * Expressed as a status rather than derived on read so that "overdue"
     * means money is unpaid, not that a date has passed — the account page
     * used to show a zero-balance card in alarm red for exactly that reason.
     */
    const aged = await this.prisma.cardStatement.updateMany({
      where: {
        account: { profileId },
        status: StatementStatus.OPEN,
        dueDate: { lt: startOfDay(asOf) },
      },
      data: { status: StatementStatus.OVERDUE },
    });

    if (generated > 0 || aged.count > 0) {
      this.logger.log('Statements generated', {
        profileId,
        generated,
        overdue: aged.count,
      });
    }

    return { generated, overdue: aged.count };
  }

  /**
   * Snapshots one statement.
   *
   * Returns false when it already exists, which is the common case: this runs
   * every night and a statement day comes round once a month.
   */
  private async generateFor(
    accountId: string,
    statementDate: Date,
    dueDate: Date,
    minDuePercent: number | null,
  ): Promise<boolean> {
    const existing = await this.prisma.cardStatement.findUnique({
      where: { accountId_statementDate: { accountId, statementDate } },
      select: { id: true },
    });

    if (existing) return false;

    // The cycle just ended: everything since the previous statement.
    const previous = await this.prisma.cardStatement.findFirst({
      where: { accountId, statementDate: { lt: statementDate } },
      orderBy: { statementDate: 'desc' },
    });

    const spend = await this.prisma.transaction.groupBy({
      by: ['direction'],
      where: {
        accountId,
        deletedAt: null,
        // Transfers are the bill being paid, not spending on the card.
        isTransfer: false,
        date: {
          ...(previous ? { gt: previous.statementDate } : {}),
          lte: statementDate,
        },
      },
      _sum: { amountMinor: true },
    });

    const sum = (direction: 'DEBIT' | 'CREDIT'): bigint =>
      spend.find((row) => row.direction === direction)?._sum.amountMinor ?? 0n;

    // Purchases less refunds in the cycle.
    const cycleSpend = sum('DEBIT') - sum('CREDIT');

    /*
     * Anything unpaid rolls forward.
     *
     * A bill you did not clear does not vanish when the next one is cut — it
     * is added to it, which is exactly how revolving credit works and why the
     * carry-over has to be part of the snapshot.
     */
    const carriedOver = previous
      ? previous.amountMinor - previous.paidMinor
      : 0n;

    const amountMinor = cycleSpend + carriedOver;

    // Nothing was spent and nothing was owed: there is no bill to issue.
    if (amountMinor <= 0n) return false;

    const percent = minDuePercent ?? 5;
    const minimum = (amountMinor * BigInt(Math.round(percent))) / 100n;

    await this.prisma.cardStatement.create({
      data: {
        accountId,
        statementDate,
        dueDate,
        amountMinor,
        // Never more than the bill itself — a 5% minimum on ₹100 should not
        // round to something larger than what is owed.
        minimumDueMinor: minimum > amountMinor ? amountMinor : minimum,
        status: StatementStatus.OPEN,
      },
    });

    return true;
  }
}
