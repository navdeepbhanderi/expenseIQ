"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./hooks";
import type { CategorySlice, Comparison, Money } from "./types";

export type PeriodKind = "month" | "quarter" | "year";

export interface Period {
  kind: string;
  label: string;
  from: string;
  to: string;
}

export interface ReportSummary {
  period: Period;
  spent: Money;
  income: Money;
  net: Money;
  transactionCount: number;
  averagePerDay: Money;
  topCategories: CategorySlice[];
  largestTransaction: {
    id: string;
    amount: Money;
    merchant: string | null;
    category: string | null;
    date: string;
  } | null;
}

/**
 * One category's movement between periods.
 *
 * Flat, not nested under a `comparison` key, and it carries no monogram or
 * tint — those come from the categories list. Verified against
 * reports.service.ts's CategoryComparison rather than assumed: the sample
 * response used to shape these types had an empty byCategory array, so the
 * item shape was invisible in it.
 */
export interface CategoryComparison extends Comparison {
  categoryId: string | null;
  name: string;
}

export interface ComparisonReport {
  current: Omit<Period, "kind">;
  previous: Omit<Period, "kind">;
  spend: Comparison;
  income: Comparison;
  /** Biggest movers first — including categories that vanished this period. */
  byCategory: CategoryComparison[];
}

/**
 * Design 3e's "74% of your usual ₹25,000 on groceries".
 *
 * Field names follow the server's CategoryNormLine exactly — `categoryName`,
 * `currentMonth`, `sampleMonths` — and there is no monogram or tint here.
 * `percentOfUsual` is nullable: a category with no history has no "usual" to
 * be a percentage of.
 */
export interface CategoryNorm {
  categoryId: string;
  categoryName: string;
  usual: Money;
  currentMonth: Money;
  percentOfUsual: number | null;
  sampleMonths: number;
  isReliable: boolean;
}

export interface TrendPoint {
  month: string;
  spent: Money;
  income: Money;
}

export interface BudgetStatusLine {
  budget: Money;
  spent: Money;
  remaining: Money;
  /** `usedPercent`, not `percentUsed` — the server's spelling. */
  usedPercent: number;
  isApproaching: boolean;
  isOver: boolean;
}

/** Category budgets nest their figures under `status`. */
export interface BudgetLine {
  categoryId: string | null;
  categoryName: string;
  status: BudgetStatusLine;
}

export interface BudgetOverview {
  month: string;
  overall: BudgetStatusLine | null;
  categories: BudgetLine[];
}

export const reportKeys = {
  summary: (profileId: string, period: PeriodKind) =>
    ["profile", profileId, "reports", "summary", period] as const,
  comparison: (profileId: string, period: PeriodKind) =>
    ["profile", profileId, "reports", "comparison", period] as const,
  norms: (profileId: string) =>
    ["profile", profileId, "reports", "norms"] as const,
  trend: (profileId: string) => ["profile", profileId, "trend"] as const,
  budgets: (profileId: string, month: string) =>
    ["profile", profileId, "budgets", month] as const,
};

export function useReportSummary(profileId: string | null, period: PeriodKind) {
  return useQuery({
    queryKey: reportKeys.summary(profileId ?? "", period),
    queryFn: () =>
      api.get<ReportSummary>(`/profiles/${profileId}/reports/summary`, {
        query: { period },
      }),
    enabled: Boolean(profileId),
  });
}

export function useComparison(profileId: string | null, period: PeriodKind) {
  return useQuery({
    queryKey: reportKeys.comparison(profileId ?? "", period),
    queryFn: () =>
      api.get<ComparisonReport>(`/profiles/${profileId}/reports/comparison`, {
        query: { period },
      }),
    enabled: Boolean(profileId),
  });
}

export function useCategoryNorms(profileId: string | null) {
  return useQuery({
    queryKey: reportKeys.norms(profileId ?? ""),
    queryFn: () =>
      api.get<CategoryNorm[]>(`/profiles/${profileId}/reports/category-norms`),
    enabled: Boolean(profileId),
  });
}

export function useTrend(profileId: string | null) {
  return useQuery({
    queryKey: reportKeys.trend(profileId ?? ""),
    queryFn: () =>
      api.get<TrendPoint[]>(`/profiles/${profileId}/dashboard/trend`),
    enabled: Boolean(profileId),
  });
}

export function useBudgets(profileId: string | null, month: string) {
  return useQuery({
    queryKey: reportKeys.budgets(profileId ?? "", month),
    queryFn: () =>
      api.get<BudgetOverview>(`/profiles/${profileId}/budgets`, {
        query: { month },
      }),
    enabled: Boolean(profileId),
  });
}

/**
 * Replaces the month's budgets.
 *
 * A PUT, not a PATCH — the endpoint takes the whole month at once, so the
 * caller must send every category it wants kept. Sending one category alone
 * would clear the rest.
 */
export function useSetBudgets(profileId: string | null, month: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      overallMinor?: number;
      categories?: { categoryId: string; amountMinor: number }[];
    }) =>
      api.put<BudgetOverview>(`/profiles/${profileId}/budgets`, body, {
        query: { month },
      }),
    onSuccess: () => {
      if (!profileId) return;
      void client.invalidateQueries({ queryKey: ["profile", profileId] });
      void client.invalidateQueries({ queryKey: keys.profiles });
    },
  });
}
