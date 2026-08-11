import { Injectable } from '@nestjs/common';
import { Direction } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { Money } from '@/common/money/money';
import {
  compareToNorm,
  computeBudgetStatus,
  computeCategoryNorm,
  type BudgetStatus,
  type CategoryNorm,
} from './domain/norms';
import { addMonths, startOfMonth } from '@/modules/dashboard/dashboard.service';
import type { SetBudgetsDto } from './dto/budget.dto';
import { monthKey } from '@/common/time/calendar';

export interface BudgetLine {
  categoryId: string | null;
  categoryName: string;
  status: BudgetStatus;
}

export interface BudgetOverview {
  month: string;
  overall: BudgetStatus | null;
  categories: BudgetLine[];
}

export interface CategoryNormLine {
  categoryId: string;
  categoryName: string;
  usual: Money;
  currentMonth: Money;
  percentOfUsual: number | null;
  sampleMonths: number;
  isReliable: boolean;
}

/** How much history a norm is computed from. */
const NORM_WINDOW_MONTHS = 6;

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(profileId: string, month: Date): Promise<BudgetOverview> {
    const start = startOfMonth(month);
    const end = addMonths(start, 1);

    const [budgets, spendRows, categories] = await Promise.all([
      this.prisma.budget.findMany({ where: { profileId, month: start } }),
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
    const spentByCategory = new Map(
      spendRows.map((row) => [
        row.categoryId,
        Money.fromBigInt(row._sum.amountMinor ?? 0n),
      ]),
    );

    const totalSpent = Money.sum([...spentByCategory.values()]);
    const overallBudget = budgets.find((b) => b.categoryId === null);

    return {
      month: monthKey(start),
      overall: overallBudget
        ? computeBudgetStatus(
            totalSpent,
            Money.fromBigInt(overallBudget.amountMinor),
          )
        : null,
      categories: budgets
        .filter((b) => b.categoryId !== null)
        .map((budget) => ({
          categoryId: budget.categoryId,
          categoryName: names.get(budget.categoryId ?? '') ?? 'Unknown',
          status: computeBudgetStatus(
            spentByCategory.get(budget.categoryId) ?? Money.zero(),
            Money.fromBigInt(budget.amountMinor),
          ),
        })),
    };
  }

  /**
   * Replaces the month's budgets wholesale.
   *
   * PUT rather than PATCH because the design edits budgets as a set - the
   * slider screen in `6c` shows every category at once, and a partial update
   * would leave a category the user just cleared still budgeted.
   *
   * An amount of 0 removes the budget rather than storing a zero, since
   * "budgeted ₹0" and "not budgeted" render identically but behave differently
   * - the first reports 100% used the moment anything is spent.
   */
  async setForMonth(
    profileId: string,
    month: Date,
    dto: SetBudgetsDto,
  ): Promise<BudgetOverview> {
    const start = startOfMonth(month);

    await this.prisma.$transaction(async (tx) => {
      await tx.budget.deleteMany({ where: { profileId, month: start } });

      const rows = [
        ...(dto.overallMinor !== undefined && dto.overallMinor > 0
          ? [
              {
                profileId,
                categoryId: null,
                month: start,
                amountMinor: BigInt(dto.overallMinor),
              },
            ]
          : []),
        ...(dto.categories ?? [])
          .filter((entry) => entry.amountMinor > 0)
          .map((entry) => ({
            profileId,
            categoryId: entry.categoryId,
            month: start,
            amountMinor: BigInt(entry.amountMinor),
          })),
      ];

      if (rows.length > 0) {
        await tx.budget.createMany({ data: rows });
      }
    });

    return this.overview(profileId, start);
  }

  /**
   * Per-category "usual" spend - design 3e's "74% of your usual ₹25,000".
   *
   * Built from the months *before* the current one. Including a month still in
   * progress would drag every norm down as the month starts and up as it ends,
   * so the comparison would say more about today's date than about spending.
   */
  async categoryNorms(
    profileId: string,
    asOf = new Date(),
  ): Promise<CategoryNormLine[]> {
    const currentStart = startOfMonth(asOf);

    // How many complete months this profile has actually been recording for.
    //
    // Without this the window is always six buckets wide, zero-filled - so a
    // profile one month old reports six months of "history" and every norm
    // claims to be reliable. Reliability has to reflect real evidence, not the
    // size of the array we happened to allocate.
    const earliest = await this.prisma.transaction.findFirst({
      where: { profileId, deletedAt: null, direction: Direction.DEBIT },
      orderBy: { date: 'asc' },
      select: { date: true },
    });

    const completeMonths = earliest
      ? monthsBetween(startOfMonth(earliest.date), currentStart)
      : 0;
    const window = Math.min(NORM_WINDOW_MONTHS, completeMonths);

    if (window === 0) {
      return [];
    }

    const windowStart = addMonths(currentStart, -window);

    const [history, current, categories] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          profileId,
          deletedAt: null,
          direction: Direction.DEBIT,
          date: { gte: windowStart, lt: currentStart },
          categoryId: { not: null },
        },
        select: { categoryId: true, date: true, amountMinor: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          profileId,
          deletedAt: null,
          direction: Direction.DEBIT,
          date: { gte: currentStart },
        },
        _sum: { amountMinor: true },
      }),
      this.prisma.category.findMany({
        where: { OR: [{ profileId: null }, { profileId }] },
        select: { id: true, name: true },
      }),
    ]);

    const names = new Map(categories.map((c) => [c.id, c.name]));
    const currentByCategory = new Map(
      current.map((row) => [
        row.categoryId,
        Money.fromBigInt(row._sum.amountMinor ?? 0n),
      ]),
    );

    // categoryId → monthKey → total
    const byCategory = new Map<string, Map<string, bigint>>();
    for (const row of history) {
      if (!row.categoryId) continue;
      const months =
        byCategory.get(row.categoryId) ?? new Map<string, bigint>();
      const key = monthKey(row.date);
      months.set(key, (months.get(key) ?? 0n) + row.amountMinor);
      byCategory.set(row.categoryId, months);
    }

    const monthKeys = Array.from({ length: window }, (_, i) =>
      monthKey(addMonths(windowStart, i)),
    );

    const lines: CategoryNormLine[] = [];

    for (const [categoryId, months] of byCategory) {
      // Zero-filled: a month where this category went untouched is real
      // evidence about what's usual, not missing data.
      const totals = monthKeys.map((key) =>
        Money.fromBigInt(months.get(key) ?? 0n),
      );

      const norm: CategoryNorm = computeCategoryNorm(totals);
      const currentMonth = currentByCategory.get(categoryId) ?? Money.zero();
      const comparison = compareToNorm(currentMonth, norm);

      lines.push({
        categoryId,
        categoryName: names.get(categoryId) ?? 'Unknown',
        usual: norm.usual,
        currentMonth,
        percentOfUsual: comparison?.percentOfUsual ?? null,
        sampleMonths: norm.sampleMonths,
        isReliable: norm.isReliable,
      });
    }

    return lines.sort((a, b) => b.usual.minor - a.usual.minor);
  }
}

/** Whole months from `from` to `to`, both normalised to a month start. */
function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}
