import { Injectable, NotFoundException } from '@nestjs/common';
import { Direction, TransactionSource, type Allowance } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { Money } from '@/common/money/money';
import { AppLogger } from '@/common/logger/app-logger.service';
import { addMonths, startOfMonth } from '@/modules/dashboard/dashboard.service';

import type { SetAllowanceDto } from './dto/family.dto';

export interface AllowanceStatus {
  allowance: Allowance | null;
  /** Credited so far this month. */
  credited: Money;
  spent: Money;
  /** Design 2c: "₹1,200 allowance · ₹740 left". */
  remaining: Money;
}

@Injectable()
export class AllowancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('Allowances');
  }

  async status(profileId: string, asOf = new Date()): Promise<AllowanceStatus> {
    const start = startOfMonth(asOf);
    const end = addMonths(start, 1);

    const [allowance, totals] = await Promise.all([
      this.prisma.allowance.findUnique({ where: { profileId } }),
      this.prisma.transaction.groupBy({
        by: ['direction'],
        where: {
          profileId,
          deletedAt: null,
          date: { gte: start, lt: end },
        },
        _sum: { amountMinor: true },
      }),
    ]);

    const of = (direction: Direction): Money =>
      Money.fromBigInt(
        totals.find((row) => row.direction === direction)?._sum.amountMinor ??
          0n,
      );

    const credited = of(Direction.CREDIT);
    const spent = of(Direction.DEBIT);
    const remaining = credited.subtract(spent);

    return {
      allowance,
      credited,
      spent,
      // Clamped: design 2c says "₹740 left", and a negative "left" is a
      // contradiction. Overspend shows as spent exceeding credited.
      remaining: remaining.isNegative ? Money.zero() : remaining,
    };
  }

  async set(
    profileId: string,
    setByUserId: string,
    dto: SetAllowanceDto,
  ): Promise<Allowance> {
    const data = {
      amountMinor: BigInt(dto.amountMinor),
      dayOfMonth: dto.dayOfMonth ?? 1,
      enabled: dto.enabled ?? true,
      setByUserId,
    };

    return this.prisma.allowance.upsert({
      where: { profileId },
      create: { profileId, ...data },
      update: data,
    });
  }

  async remove(profileId: string): Promise<void> {
    const allowance = await this.prisma.allowance.findUnique({
      where: { profileId },
    });

    if (!allowance) throw new NotFoundException('No allowance is set');

    await this.prisma.allowance.delete({ where: { profileId } });
  }

  /**
   * Credits this month's allowance, once.
   *
   * Goes **straight into the ledger** rather than the review queue, unlike a
   * generated recurring payment. The distinction is certainty: a recurring
   * bill's amount is a prediction that may be wrong, whereas an allowance is
   * a fixed figure an owner set — there is nothing for the child to verify,
   * and asking them to confirm their own pocket money would be pure ceremony.
   *
   * `lastCreditedMonth` is the idempotency guard: a scheduler that fires
   * twice must not hand out pocket money twice.
   */
  async creditDue(
    profileId: string,
    asOf = new Date(),
  ): Promise<{ credited: boolean; reason?: string }> {
    const allowance = await this.prisma.allowance.findUnique({
      where: { profileId },
    });

    if (!allowance?.enabled) {
      return { credited: false, reason: 'no-allowance' };
    }

    const monthKey = asOf.toISOString().slice(0, 7);

    if (allowance.lastCreditedMonth === monthKey) {
      return { credited: false, reason: 'already-credited' };
    }

    // Clamped, so a day-of-month of 31 still lands in February.
    const start = startOfMonth(asOf);
    const lastDay = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const creditDay = Math.min(allowance.dayOfMonth, lastDay);
    const creditDate = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), creditDay),
    );

    if (creditDate.getTime() > asOf.getTime()) {
      return { credited: false, reason: 'not-yet-due' };
    }

    const incomeCategory = await this.prisma.category.findFirst({
      where: { isIncome: true, OR: [{ profileId: null }, { profileId }] },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          profileId,
          amountMinor: allowance.amountMinor,
          direction: Direction.CREDIT,
          date: creditDate,
          categoryId: incomeCategory?.id ?? null,
          note: 'Allowance',
          source: TransactionSource.RECURRING,
        },
      });

      await tx.allowance.update({
        where: { profileId },
        data: { lastCreditedMonth: monthKey },
      });
    });

    this.logger.log('Allowance credited', {
      profileId,
      month: monthKey,
      amountMinor: Number(allowance.amountMinor),
    });

    return { credited: true };
  }
}
