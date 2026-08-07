import { Injectable } from '@nestjs/common';
import { AccountType, Direction, type Account } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { Money } from '@/common/money/money';
import {
  computeBillingCycle,
  computeCardPosition,
} from '@/modules/accounts/domain/billing-cycle';
import { summariseLoan } from '@/modules/accounts/domain/amortization';
import {
  compareToPrevious,
  computeBudgetStatus,
  type BudgetStatus,
  type Comparison,
} from '@/modules/budgets/domain/norms';
import { loanTermsFrom } from '@/modules/accounts/domain/loan-terms';

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  monogram: string;
  tint: string;
  spent: Money;
  /** Share of the month's total spend, for the bar widths in design 2a. */
  sharePercent: number;
}

export interface UpcomingDue {
  accountId: string;
  name: string;
  type: AccountType;
  amount: Money;
  dueDate: Date;
  daysUntilDue: number;
  isOverdue: boolean;
  autoDebit: boolean;
  /** Cards only — design 2a shows "min ₹1,180" alongside the total. */
  minimumDue: Money | null;
}

export interface NetWorth {
  assets: Money;
  liabilities: Money;
  net: Money;
}

export interface DashboardSummary {
  greetingName: string | null;
  asOf: Date;
  month: {
    spent: Money;
    income: Money;
    budget: BudgetStatus | null;
    versusLastMonth: Comparison;
  };
  topCategories: CategorySlice[];
  upcomingDues: UpcomingDue[];
  pendingReviewCount: number;
  accounts: Account[];
  netWorth: NetWorth;
  recentTransactionIds: string[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything design 2a and 4c render, in one request.
   *
   * A dashboard that fires eight parallel calls is eight chances to show a
   * half-loaded screen and eight opportunities for the numbers to disagree
   * with each other. The queries still run concurrently — they're just
   * assembled server-side into one consistent snapshot.
   */
  async summary(
    profileId: string,
    asOf = new Date(),
  ): Promise<DashboardSummary> {
    const monthStart = startOfMonth(asOf);
    const previousStart = addMonths(monthStart, -1);

    const [
      profile,
      thisMonth,
      lastMonth,
      topCategories,
      accounts,
      pendingReviewCount,
      recent,
      budget,
    ] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { id: profileId },
        select: {
          name: true,
          members: {
            take: 1,
            orderBy: { joinedAt: 'asc' },
            select: { user: { select: { displayName: true } } },
          },
        },
      }),
      this.periodTotals(profileId, monthStart, asOf),
      this.periodTotals(profileId, previousStart, monthStart),
      this.spendByCategory(profileId, monthStart, asOf, 4),
      this.prisma.account.findMany({
        where: { profileId, closedAt: null },
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.reviewQueueItem.count({
        where: { profileId, status: 'PENDING' },
      }),
      this.prisma.transaction.findMany({
        where: { profileId, deletedAt: null },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 10,
        select: { id: true },
      }),
      this.overallBudget(profileId, monthStart),
    ]);

    return {
      greetingName: profile?.members[0]?.user.displayName ?? null,
      asOf,
      month: {
        spent: thisMonth.spent,
        income: thisMonth.income,
        budget: budget ? computeBudgetStatus(thisMonth.spent, budget) : null,
        versusLastMonth: compareToPrevious(thisMonth.spent, lastMonth.spent),
      },
      topCategories,
      upcomingDues: this.upcomingDues(accounts, asOf),
      pendingReviewCount,
      accounts,
      netWorth: this.netWorth(accounts),
      recentTransactionIds: recent.map((row) => row.id),
    };
  }

  /**
   * Assets minus liabilities — design 2a's "Net worth ₹— 34.2L".
   *
   * Cards and loans contribute their *current* outstanding, not their limit or
   * original principal, so the figure improves with every EMI paid. A large
   * home loan makes this negative early in its term; that's correct, and the
   * design showing a negative number confirms it.
   */
  private netWorth(accounts: Account[]): NetWorth {
    let assets = Money.zero();
    let liabilities = Money.zero();

    for (const account of accounts) {
      switch (account.type) {
        case AccountType.BANK:
        case AccountType.CASH:
          assets = assets.add(Money.fromBigInt(account.balanceMinor));
          break;

        case AccountType.CREDIT_CARD:
          liabilities = liabilities.add(
            Money.fromBigInt(account.balanceMinor).abs(),
          );
          break;

        case AccountType.LOAN: {
          const outstanding = this.loanOutstanding(account);
          if (outstanding) liabilities = liabilities.add(outstanding);
          break;
        }
      }
    }

    return { assets, liabilities, net: assets.subtract(liabilities) };
  }

  private loanOutstanding(account: Account): Money | null {
    const terms = loanTermsFrom(account);
    if (!terms) return null;

    try {
      return summariseLoan(terms, account.emisPaid ?? 0).outstanding;
    } catch {
      // A half-configured loan must not take the whole dashboard down with it.
      return Money.fromBigInt(account.principalMinor ?? 0n);
    }
  }

  /** Design 2a's "Needs your eye" strip and 4c's due card. */
  private upcomingDues(accounts: Account[], asOf: Date): UpcomingDue[] {
    const dues: UpcomingDue[] = [];

    for (const account of accounts) {
      if (
        account.type === AccountType.CREDIT_CARD &&
        account.statementDay !== null &&
        account.dueDay !== null
      ) {
        const cycle = computeBillingCycle({
          statementDay: account.statementDay,
          dueDay: account.dueDay,
          asOf,
        });
        const position = computeCardPosition({
          outstanding: Money.fromBigInt(account.balanceMinor).abs(),
          creditLimit: Money.fromBigInt(account.creditLimitMinor ?? 0n),
          minDuePercent: account.minDuePercent ?? 5,
        });

        // A settled card isn't "needing your eye".
        if (position.outstanding.isPositive) {
          dues.push({
            accountId: account.id,
            name: account.name,
            type: account.type,
            amount: position.outstanding,
            dueDate: cycle.dueDate,
            daysUntilDue: cycle.daysUntilDue,
            isOverdue: cycle.isOverdue,
            autoDebit: account.autoDebit,
            minimumDue: position.minimumDue,
          });
        }
        continue;
      }

      if (account.type === AccountType.LOAN) {
        const terms = loanTermsFrom(account);
        if (!terms) continue;

        try {
          const summary = summariseLoan(terms, account.emisPaid ?? 0);
          if (!summary.nextEmiDate) continue;

          dues.push({
            accountId: account.id,
            name: account.name,
            type: account.type,
            amount: summary.emi,
            dueDate: summary.nextEmiDate,
            daysUntilDue: daysBetween(summary.nextEmiDate, asOf),
            isOverdue:
              summary.nextEmiDate.getTime() < startOfDay(asOf).getTime(),
            autoDebit: account.autoDebit,
            minimumDue: null,
          });
        } catch {
          continue;
        }
      }
    }

    // Soonest first, so the strip leads with what actually needs attention.
    return dues.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }

  async periodTotals(
    profileId: string,
    from: Date,
    to: Date,
  ): Promise<{ spent: Money; income: Money }> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['direction'],
      where: {
        profileId,
        deletedAt: null,
        date: { gte: from, lt: to },
      },
      _sum: { amountMinor: true },
    });

    const of = (direction: Direction): Money =>
      Money.fromBigInt(
        grouped.find((row) => row.direction === direction)?._sum.amountMinor ??
          0n,
      );

    return { spent: of(Direction.DEBIT), income: of(Direction.CREDIT) };
  }

  /** Design 2a's category bars and the donut in the spec's widget list. */
  async spendByCategory(
    profileId: string,
    from: Date,
    to: Date,
    limit?: number,
  ): Promise<CategorySlice[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        profileId,
        deletedAt: null,
        direction: Direction.DEBIT,
        date: { gte: from, lt: to },
      },
      _sum: { amountMinor: true },
    });

    const ids = grouped
      .map((row) => row.categoryId)
      .filter((id): id is string => id !== null);

    const categories = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, monogram: true, tint: true },
    });
    const byId = new Map(categories.map((c) => [c.id, c]));

    const total = Money.fromBigInt(
      grouped.reduce((sum, row) => sum + (row._sum.amountMinor ?? 0n), 0n),
    );

    const slices = grouped
      .map((row) => {
        const spent = Money.fromBigInt(row._sum.amountMinor ?? 0n);
        const category = row.categoryId ? byId.get(row.categoryId) : undefined;

        return {
          categoryId: row.categoryId,
          name: category?.name ?? 'Uncategorised',
          monogram: category?.monogram ?? 'OT',
          tint: category?.tint ?? '#F1EBE0',
          spent,
          sharePercent: spent.ratioOf(total),
        };
      })
      .sort((a, b) => b.spent.minor - a.spent.minor);

    return limit === undefined ? slices : slices.slice(0, limit);
  }

  /** Design 2a's "Income vs expense" line chart, last N months. */
  async trend(
    profileId: string,
    months: number,
    asOf = new Date(),
  ): Promise<{ month: string; spent: Money; income: Money }[]> {
    const start = addMonths(startOfMonth(asOf), -(months - 1));

    const rows = await this.prisma.transaction.findMany({
      where: { profileId, deletedAt: null, date: { gte: start } },
      select: { date: true, direction: true, amountMinor: true },
    });

    // Every month is seeded, so a month with no activity charts as a zero
    // rather than vanishing and making the line jump.
    const buckets = new Map<string, { spent: bigint; income: bigint }>();
    for (let i = 0; i < months; i += 1) {
      buckets.set(monthKey(addMonths(start, i)), { spent: 0n, income: 0n });
    }

    for (const row of rows) {
      const bucket = buckets.get(monthKey(row.date));
      if (!bucket) continue;

      if (row.direction === Direction.DEBIT) {
        bucket.spent += row.amountMinor;
      } else {
        bucket.income += row.amountMinor;
      }
    }

    return [...buckets.entries()].map(([month, totals]) => ({
      month,
      spent: Money.fromBigInt(totals.spent),
      income: Money.fromBigInt(totals.income),
    }));
  }

  /** Design 6d's calendar popover, which marks days that carry a bill. */
  async dueDatesInMonth(
    profileId: string,
    month: Date,
  ): Promise<{ date: Date; accountId: string; name: string; amount: Money }[]> {
    const accounts = await this.prisma.account.findMany({
      where: { profileId, closedAt: null },
    });

    const start = startOfMonth(month);
    const end = addMonths(start, 1);

    return this.upcomingDues(accounts, start)
      .filter(
        (due) =>
          due.dueDate.getTime() >= start.getTime() &&
          due.dueDate.getTime() < end.getTime(),
      )
      .map((due) => ({
        date: due.dueDate,
        accountId: due.accountId,
        name: due.name,
        amount: due.amount,
      }));
  }

  private async overallBudget(
    profileId: string,
    month: Date,
  ): Promise<Money | null> {
    const budget = await this.prisma.budget.findFirst({
      where: { profileId, categoryId: null, month },
      select: { amountMinor: true },
    });

    return budget ? Money.fromBigInt(budget.amountMinor) : null;
  }
}

// ─── Date helpers, all UTC ─────────────────────────────────────────────────────

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.round(
    (startOfDay(later).getTime() - startOfDay(earlier).getTime()) / 86_400_000,
  );
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}
