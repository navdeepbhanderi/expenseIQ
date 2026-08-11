import { Injectable } from '@nestjs/common';
import { Direction } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { Money } from '@/common/money/money';
import {
  compareToPrevious,
  type Comparison,
} from '@/modules/budgets/domain/norms';
import {
  DashboardService,
  type CategorySlice,
} from '@/modules/dashboard/dashboard.service';

import {
  currentPeriod,
  elapsedDays,
  previousPeriod,
  type PeriodKind,
} from './domain/periods';

export interface ReportSummary {
  period: { kind: PeriodKind; label: string; from: Date; to: Date };
  spent: Money;
  income: Money;
  net: Money;
  transactionCount: number;
  /** Spend divided by days *elapsed*, not days in the period. */
  averagePerDay: Money;
  topCategories: CategorySlice[];
  largestTransaction: {
    id: string;
    amount: Money;
    merchant: string | null;
    category: string | null;
    date: Date;
  } | null;
}

export interface CategoryComparison {
  categoryId: string | null;
  name: string;
  current: Money;
  previous: Money;
  delta: Money;
  deltaPercent: number | null;
  direction: 'up' | 'down' | 'flat';
}

export interface ComparisonReport {
  current: { label: string; from: Date; to: Date };
  previous: { label: string; from: Date; to: Date };
  spend: Comparison;
  income: Comparison;
  /** Biggest movers first - the interesting rows, not the alphabetical ones. */
  byCategory: CategoryComparison[];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
  ) {}

  async summary(
    profileId: string,
    kind: PeriodKind,
    asOf = new Date(),
  ): Promise<ReportSummary> {
    const period = currentPeriod(kind, asOf);

    const [totals, topCategories, count, largest] = await Promise.all([
      this.dashboard.periodTotals(profileId, period.from, period.to),
      this.dashboard.spendByCategory(profileId, period.from, period.to),
      this.prisma.transaction.count({
        where: {
          profileId,
          deletedAt: null,
          date: { gte: period.from, lt: period.to },
        },
      }),
      this.prisma.transaction.findFirst({
        where: {
          profileId,
          deletedAt: null,
          direction: Direction.DEBIT,
          // Money moved between the user's own accounts is not spending.
          isTransfer: false,
          date: { gte: period.from, lt: period.to },
        },
        orderBy: { amountMinor: 'desc' },
        include: { merchant: true, category: true },
      }),
    ]);

    const days = elapsedDays(period, asOf);

    return {
      period: {
        kind: period.kind,
        label: period.label,
        from: period.from,
        to: period.to,
      },
      spent: totals.spent,
      income: totals.income,
      net: totals.income.subtract(totals.spent),
      transactionCount: count,
      averagePerDay: totals.spent.multiply(1 / days),
      topCategories,
      largestTransaction: largest
        ? {
            id: largest.id,
            amount: Money.fromBigInt(largest.amountMinor),
            merchant: largest.merchant?.normalizedName ?? null,
            category: largest.category?.name ?? null,
            date: largest.date,
          }
        : null,
    };
  }

  /**
   * This period against the last - design 6f's "↓ 8% vs July".
   *
   * Compares like with like: a month against the previous month, a quarter
   * against the previous quarter. Comparing a part-elapsed August against a
   * complete July would report a fall every month until the last day of it,
   * so the caller is told how far through the current period it is and can
   * caption accordingly.
   */
  async comparison(
    profileId: string,
    kind: PeriodKind,
    asOf = new Date(),
  ): Promise<ComparisonReport> {
    const current = currentPeriod(kind, asOf);
    const previous = previousPeriod(current);

    const [
      currentTotals,
      previousTotals,
      currentByCategory,
      previousByCategory,
    ] = await Promise.all([
      this.dashboard.periodTotals(profileId, current.from, current.to),
      this.dashboard.periodTotals(profileId, previous.from, previous.to),
      this.dashboard.spendByCategory(profileId, current.from, current.to),
      this.dashboard.spendByCategory(profileId, previous.from, previous.to),
    ]);

    const previousByCategoryId = new Map(
      previousByCategory.map((slice) => [slice.categoryId, slice]),
    );

    const seen = new Set<string | null>();
    const byCategory: CategoryComparison[] = [];

    for (const slice of currentByCategory) {
      seen.add(slice.categoryId);
      const before =
        previousByCategoryId.get(slice.categoryId)?.spent ?? Money.zero();
      byCategory.push(
        toComparison(slice.categoryId, slice.name, slice.spent, before),
      );
    }

    // Categories that vanished this period are the most interesting rows on
    // the screen - a subscription that stopped, a habit that broke. Listing
    // only what's present this month would hide exactly that.
    for (const slice of previousByCategory) {
      if (seen.has(slice.categoryId)) continue;
      byCategory.push(
        toComparison(slice.categoryId, slice.name, Money.zero(), slice.spent),
      );
    }

    return {
      current: { label: current.label, from: current.from, to: current.to },
      previous: { label: previous.label, from: previous.from, to: previous.to },
      spend: compareToPrevious(currentTotals.spent, previousTotals.spent),
      income: compareToPrevious(currentTotals.income, previousTotals.income),
      byCategory: byCategory.sort(
        (a, b) => Math.abs(b.delta.minor) - Math.abs(a.delta.minor),
      ),
    };
  }
}

function toComparison(
  categoryId: string | null,
  name: string,
  current: Money,
  previous: Money,
): CategoryComparison {
  const comparison = compareToPrevious(current, previous);

  return {
    categoryId,
    name,
    current,
    previous,
    delta: comparison.delta,
    deltaPercent: comparison.deltaPercent,
    direction: comparison.direction,
  };
}
