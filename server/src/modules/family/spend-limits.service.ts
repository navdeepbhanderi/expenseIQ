import { Injectable, NotFoundException } from '@nestjs/common';
import { Direction, NotificationSeverity, ProfileRole } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { Money } from '@/common/money/money';
import { AppLogger } from '@/common/logger/app-logger.service';
import {
  computeBudgetStatus,
  type BudgetStatus,
} from '@/modules/budgets/domain/norms';
import { addMonths, startOfMonth } from '@/modules/dashboard/dashboard.service';
import {
  NOTIFICATION_KINDS,
  NotificationsService,
} from '@/modules/notifications/notifications.service';

import type { SetSpendLimitsDto } from './dto/family.dto';
import { monthKey } from '@/common/time/calendar';

export interface SpendLimitLine {
  categoryId: string | null;
  categoryName: string;
  status: BudgetStatus;
}

export interface SpendLimitOverview {
  month: string;
  overall: SpendLimitLine | null;
  categories: SpendLimitLine[];
}

/**
 * Parental spend limits.
 *
 * The spec is emphatic about the design intent: **nudge, never block.** A
 * transaction over the limit is still recorded — "blocking transactions
 * outright could push kids to just not log them, defeating the purpose".
 * So nothing here refuses a write; it raises notifications instead.
 *
 * Reuses `computeBudgetStatus` rather than restating the arithmetic. A limit
 * and a budget are the same calculation with different authority over who may
 * set it, and two implementations would eventually disagree about what 80%
 * means.
 */
@Injectable()
export class SpendLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('SpendLimits');
  }

  async overview(
    profileId: string,
    asOf = new Date(),
  ): Promise<SpendLimitOverview> {
    const start = startOfMonth(asOf);
    const end = addMonths(start, 1);

    const [limits, spendRows, categories] = await Promise.all([
      this.prisma.spendLimit.findMany({ where: { profileId } }),
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          profileId,
          deletedAt: null,
          direction: Direction.DEBIT,
          date: { gte: start, lt: end },
        },
        _sum: { amountMinor: true },
      }),
      this.prisma.category.findMany({
        where: { OR: [{ profileId: null }, { profileId }] },
        select: { id: true, name: true },
      }),
    ]);

    const names = new Map(categories.map((c) => [c.id, c.name]));
    const spentBy = new Map(
      spendRows.map((row) => [
        row.categoryId,
        Money.fromBigInt(row._sum.amountMinor ?? 0n),
      ]),
    );
    const totalSpent = Money.sum([...spentBy.values()]);

    const overallLimit = limits.find((limit) => limit.categoryId === null);

    return {
      month: monthKey(start),
      overall: overallLimit
        ? {
            categoryId: null,
            categoryName: 'All spending',
            status: computeBudgetStatus(
              totalSpent,
              Money.fromBigInt(overallLimit.monthlyLimitMinor),
            ),
          }
        : null,
      categories: limits
        .filter((limit) => limit.categoryId !== null)
        .map((limit) => ({
          categoryId: limit.categoryId,
          categoryName: names.get(limit.categoryId ?? '') ?? 'Unknown',
          status: computeBudgetStatus(
            spentBy.get(limit.categoryId) ?? Money.zero(),
            Money.fromBigInt(limit.monthlyLimitMinor),
          ),
        })),
    };
  }

  /** Replaces the limit set, like budgets. Zero removes a limit. */
  async set(
    profileId: string,
    setByUserId: string,
    dto: SetSpendLimitsDto,
  ): Promise<SpendLimitOverview> {
    await this.prisma.$transaction(async (tx) => {
      await tx.spendLimit.deleteMany({ where: { profileId } });

      const rows = [
        ...(dto.overallMinor !== undefined && dto.overallMinor > 0
          ? [
              {
                profileId,
                categoryId: null,
                monthlyLimitMinor: BigInt(dto.overallMinor),
                setByUserId,
              },
            ]
          : []),
        ...(dto.categories ?? [])
          .filter((entry) => entry.amountMinor > 0)
          .map((entry) => ({
            profileId,
            categoryId: entry.categoryId,
            monthlyLimitMinor: BigInt(entry.amountMinor),
            setByUserId,
          })),
      ];

      if (rows.length > 0) {
        await tx.spendLimit.createMany({ data: rows });
      }
    });

    return this.overview(profileId);
  }

  /**
   * Checks limits after a spend and raises the appropriate nudge.
   *
   * Called after a transaction lands rather than before it is written,
   * because the answer never prevents the write — the spec's design rationale
   * is that blocking pushes kids to stop logging, which destroys the data the
   * whole feature exists to produce.
   *
   * The child is nudged at 80%; the owners are told when it is exceeded. Two
   * different audiences, because "you're getting close" is guidance and
   * "they've gone over" is oversight.
   */
  async evaluate(
    profileId: string,
    asOf = new Date(),
  ): Promise<{ approaching: string[]; exceeded: string[] }> {
    const overview = await this.overview(profileId, asOf);
    const lines = [
      ...(overview.overall ? [overview.overall] : []),
      ...overview.categories,
    ];

    const approaching: string[] = [];
    const exceeded: string[] = [];
    const month = overview.month;

    for (const line of lines) {
      if (line.status.isOver) {
        exceeded.push(line.categoryName);

        await this.notifications.raise({
          profileId,
          kind: NOTIFICATION_KINDS.budgetExceeded,
          title: `${line.categoryName} is over its limit`,
          body:
            `₹${line.status.spent.toMajor().toLocaleString('en-IN')} spent of ` +
            `₹${line.status.budget.toMajor().toLocaleString('en-IN')}.`,
          severity: NotificationSeverity.WARNING,
          payload: { categoryId: line.categoryId, month },
          dedupeKey: `limit:${line.categoryId ?? 'overall'}:${month}:exceeded`,
        });

        await this.notifyOwners(profileId, line, month);
        continue;
      }

      if (line.status.isApproaching) {
        approaching.push(line.categoryName);

        await this.notifications.raise({
          profileId,
          kind: NOTIFICATION_KINDS.budgetApproaching,
          title: `${line.categoryName} is at ${Math.round(line.status.usedPercent)}%`,
          body: `₹${line.status.remaining.toMajor().toLocaleString('en-IN')} left this month.`,
          severity: NotificationSeverity.INFO,
          payload: { categoryId: line.categoryId, month },
          dedupeKey: `limit:${line.categoryId ?? 'overall'}:${month}:approaching`,
        });
      }
    }

    return { approaching, exceeded };
  }

  /**
   * Tells the owners a limit was exceeded.
   *
   * Delivered to the *owner's own* profiles, not to the child's — an alert
   * about oversight belongs where the person exercising it will actually see
   * it, and a parent does not routinely open their child's profile.
   */
  private async notifyOwners(
    childProfileId: string,
    line: SpendLimitLine,
    month: string,
  ): Promise<void> {
    const child = await this.prisma.profile.findUnique({
      where: { id: childProfileId },
      select: {
        name: true,
        members: {
          where: { role: ProfileRole.OWNER },
          select: { userId: true },
        },
      },
    });

    if (!child) return;

    for (const owner of child.members) {
      const ownerProfiles = await this.prisma.profileMember.findMany({
        where: { userId: owner.userId, role: ProfileRole.OWNER },
        select: { profileId: true },
      });

      // Their default profile is where they actually live day to day.
      const target = ownerProfiles.find((p) => p.profileId !== childProfileId);
      if (!target) continue;

      await this.notifications.raise({
        profileId: target.profileId,
        kind: NOTIFICATION_KINDS.budgetExceeded,
        title: `${child.name} is over the ${line.categoryName} limit`,
        body:
          `₹${line.status.spent.toMajor().toLocaleString('en-IN')} spent of ` +
          `₹${line.status.budget.toMajor().toLocaleString('en-IN')}.`,
        severity: NotificationSeverity.WARNING,
        payload: { childProfileId, categoryId: line.categoryId, month },
        dedupeKey: `child:${childProfileId}:${line.categoryId ?? 'overall'}:${month}`,
      });
    }
  }

  async assertProfileExists(profileId: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true },
    });

    if (!profile) throw new NotFoundException('Profile not found');
  }
}
