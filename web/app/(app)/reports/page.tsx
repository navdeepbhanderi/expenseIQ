"use client";

import { useState } from "react";
import { useProfile } from "@/components/providers/profile-provider";
import { useCategories } from "@/lib/api/hooks";
import {
  useBudgets,
  useCategoryNorms,
  useComparison,
  useReportSummary,
  useSetBudgets,
  useTrend,
  type PeriodKind,
} from "@/lib/api/reports";
import { Amount, CategoryMark, Delta, Eyebrow } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Progress } from "@/components/ui/feedback";
import { ReportsSkeleton } from "@/components/ui/skeletons";
import { Modal } from "@/components/ui/overlay";
import { AmountInput } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatMinor, percentOf } from "@/lib/money";
import { cn } from "@/lib/cn";

/** Reports and budgets - design 3e's norms plus the 6f period switcher. */
export default function ReportsPage() {
  const { activeId } = useProfile();
  const { data: categories = [] } = useCategories(activeId);
  const [period, setPeriod] = useState<PeriodKind>("month");
  const month = new Date().toISOString().slice(0, 7);

  const summary = useReportSummary(activeId, period);
  const comparison = useComparison(activeId, period);
  const norms = useCategoryNorms(activeId);
  const trend = useTrend(activeId);
  const budgets = useBudgets(activeId, month);

  const [editingBudget, setEditingBudget] = useState(false);

  if (summary.isPending) return <ReportsSkeleton />;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink sm:text-[27px]">
            Reports
          </h1>
          {summary.data && (
            <p className="mt-0.5 text-sm text-ink-muted">
              {summary.data.period.label}
            </p>
          )}
        </div>

        <Segmented
          aria-label="Period"
          value={period}
          onValueChange={setPeriod}
          options={[
            { value: "month", label: "Month" },
            { value: "quarter", label: "Quarter" },
            { value: "year", label: "Year" },
          ]}
        />
      </div>

      {/* ---- headline ---- */}
      {summary.data && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
            <Eyebrow>Spent</Eyebrow>
            <p className="mt-1">
              <Amount value={summary.data.spent} size="lg" />
            </p>
            {comparison.data && (
              <Delta
                comparison={comparison.data.spend}
                periodLabel={comparison.data.previous.label}
                className="mt-1.5"
              />
            )}
          </div>

          <div className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
            <Eyebrow>Received</Eyebrow>
            <p className="mt-1">
              <Amount value={summary.data.income} size="lg" />
            </p>
            <p className="mt-1.5 text-xs text-ink-faint">
              {summary.data.transactionCount} transactions
            </p>
          </div>

          <div className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
            <Eyebrow>Average a day</Eyebrow>
            <p className="mt-1">
              <Amount value={summary.data.averagePerDay} size="lg" />
            </p>
          </div>
        </section>
      )}

      {/* ---- budgets ---- */}
      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <div className="flex items-center justify-between">
          <Eyebrow>Budget for {month}</Eyebrow>
          <Button variant="ghost" size="sm" onClick={() => setEditingBudget(true)}>
            {budgets.data?.overall ? "Change" : "Set a budget"}
          </Button>
        </div>

        {budgets.data?.overall ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <Amount value={budgets.data.overall.spent} size="lg" />
              <span className="text-[13px] text-ink-muted">
                of {formatMinor(budgets.data.overall.budget.amountMinor)}
              </span>
            </div>
            <Progress
              className="mt-2"
              value={budgets.data.overall.usedPercent}
              label="Budget used"
            />
            <p
              className={cn(
                "mt-1.5 text-[13px]",
                budgets.data.overall.isOver ? "text-spend" : "text-ink-muted",
              )}
            >
              {budgets.data.overall.isOver
                ? `${formatMinor(Math.abs(budgets.data.overall.remaining.amountMinor))} over budget`
                : `${formatMinor(budgets.data.overall.remaining.amountMinor)} left`}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">
            No budget set for this month.
          </p>
        )}
      </section>

      {/* ---- norms: design 3e ---- */}
      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <Eyebrow>Against your usual</Eyebrow>

        {(norms.data?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            A few months of history and this will show how each category
            compares with what you normally spend.
          </p>
        ) : (
          <ul className="mt-3.5 flex flex-col gap-3.5">
            {norms.data!.map((norm) => {
              const category = categories.find((c) => c.id === norm.categoryId);

              return (
                <li key={norm.categoryId} className="flex items-center gap-3">
                  {category ? (
                    <CategoryMark
                      monogram={category.monogram}
                      tint={category.tint}
                    />
                  ) : (
                    <span className="size-[26px] shrink-0 rounded-lg bg-paper-raised" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="truncate text-ink-soft">
                        {norm.categoryName}
                      </span>
                      <span className="text-ink-muted">
                        {norm.percentOfUsual === null
                          ? `No usual yet · ${formatMinor(norm.currentMonth.amountMinor)}`
                          : `${Math.round(norm.percentOfUsual)}% of your usual ${formatMinor(norm.usual.amountMinor)}`}
                      </span>
                    </div>

                    <Progress
                      className="mt-1.5"
                      value={norm.percentOfUsual ?? 0}
                      max={150}
                    />

                    {/*
                     * A baseline from one or two months is an average of
                     * noise. Saying so is more useful than quietly presenting
                     * it as a habit the user does not have.
                     */}
                    {!norm.isReliable && (
                      <p className="mt-1 text-[11px] text-ink-faint">
                        Based on {norm.sampleMonths} month
                        {norm.sampleMonths === 1 ? "" : "s"} - still settling
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- trend ---- */}
      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <Eyebrow>Last six months</Eyebrow>
        {(trend.data?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Not enough history yet.</p>
        ) : (
          <TrendChart points={trend.data!} />
        )}
      </section>

      {/* ---- category comparison ---- */}
      {(comparison.data?.byCategory.length ?? 0) > 0 && (
        <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
          <Eyebrow>Versus {comparison.data!.previous.label}</Eyebrow>
          <ul className="mt-3 flex flex-col gap-2.5">
            {comparison.data!.byCategory.slice(0, 8).map((row) => {
              // The comparison carries no monogram or tint, so the mark comes
              // from the categories list the page already has.
              const category = categories.find((c) => c.id === row.categoryId);

              return (
                <li
                  key={row.categoryId ?? row.name}
                  className="flex items-center gap-3"
                >
                  {category ? (
                    <CategoryMark
                      monogram={category.monogram}
                      tint={category.tint}
                      size="sm"
                    />
                  ) : (
                    <span className="size-6 shrink-0 rounded-lg bg-paper-raised" />
                  )}

                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                    {row.name}
                  </span>

                  {/* The row IS the comparison - current/previous/delta live
                      on it directly, not under a nested key. */}
                  <Amount value={row.current} size="sm" />
                  <Delta comparison={row} periodLabel="" className="w-24 justify-end" />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <BudgetModal
        open={editingBudget}
        onOpenChange={setEditingBudget}
        month={month}
        current={budgets.data?.overall?.budget.amountMinor ?? null}
      />
    </div>
  );
}

/**
 * Six-month bars.
 *
 * Deliberately not a charting library: this is one series of six values, and
 * a dependency that ships a rendering engine to draw six rectangles is a poor
 * trade against a page that already has to be fast on a phone.
 */
function TrendChart({
  points,
}: {
  points: { month: string; spent: { amountMinor: number } }[];
}) {
  const peak = Math.max(...points.map((p) => p.spent.amountMinor), 1);

  return (
    <div className="mt-4 flex items-end gap-2 sm:gap-3">
      {points.map((point) => {
        const height = percentOf(point.spent.amountMinor, peak) ?? 0;

        return (
          <div key={point.month} className="flex flex-1 flex-col items-center gap-2">
            <span className="tabular font-mono text-[10px] text-ink-faint">
              {formatMinor(point.spent.amountMinor)}
            </span>
            <div
              className="w-full rounded-t-md bg-green transition-all"
              // A floor of 2% so a zero-spend month is still a visible bar
              // rather than a gap the eye reads as missing data.
              style={{ height: `${Math.max(2, height)}px`, minHeight: 4 }}
            />
            <span className="text-[11px] text-ink-muted">
              {new Date(`${point.month}-01`).toLocaleDateString("en-IN", {
                month: "short",
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BudgetModal({
  open,
  onOpenChange,
  month,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  current: number | null;
}) {
  const { activeId } = useProfile();
  const setBudgets = useSetBudgets(activeId, month);
  const { data: categories = [] } = useCategories(activeId);
  const { toast } = useToast();
  const [amount, setAmount] = useState<number | null>(current);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Monthly budget"
      description="One number for the month. Category budgets can come later."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={setBudgets.isPending}
            onClick={() => {
              void setBudgets
                .mutateAsync({ overallMinor: amount ?? 0 })
                .then(() => {
                  toast({ title: "Budget saved", tone: "success" });
                  onOpenChange(false);
                })
                .catch(() =>
                  toast({ title: "Couldn't save that", tone: "error" }),
                );
            }}
          >
            Save budget
          </Button>
        </>
      }
    >
      <AmountInput
        label={`Budget for ${month}`}
        valueMinor={amount}
        onValueChange={setAmount}
        hint="Set 0 to remove it"
      />
      <p className="mt-3 text-xs text-ink-faint">
        {categories.length} categories available for per-category budgets.
      </p>
    </Modal>
  );
}
