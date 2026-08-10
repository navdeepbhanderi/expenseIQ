"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useProfile } from "@/components/providers/profile-provider";
import { useDashboard } from "@/lib/api/hooks";
import { Amount, CategoryMark, Delta, Eyebrow } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Progress, Skeleton, EmptyState } from "@/components/ui/feedback";
import { formatCompact, formatMinor, percentOf } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { DashboardSummary, UpcomingDue } from "@/lib/api/types";

/**
 * Dashboard — design 2a (desktop) and 4c (mobile).
 *
 * The design's ordering is the whole point: attention first (dues, review
 * queue), routine data second. A dashboard that leads with a spend total
 * tells you what already happened; this one leads with what is about to.
 */
export default function DashboardPage() {
  const { activeId, active } = useProfile();
  const { data, isPending, isError, refetch } = useDashboard(activeId);

  if (isPending || !activeId) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="Couldn't load your dashboard"
          action={
            <Button size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        >
          The server didn&rsquo;t answer. Your data is safe — this is just this
          screen.
        </EmptyState>
      </div>
    );
  }

  const pending = active?.pendingReviewCount ?? data.pendingReviewCount;

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6">
      <Greeting data={data} pending={pending} />

      {/* ---- attention first ---- */}
      {(data.upcomingDues.length > 0 || pending > 0) && (
        <section className="flex flex-col gap-2.5">
          <Eyebrow>Needs your eye</Eyebrow>

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
            {data.upcomingDues.slice(0, 2).map((due) => (
              <DueTile key={`${due.accountId}-${due.dueDate}`} due={due} />
            ))}

            {pending > 0 && <ReviewTile count={pending} />}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:gap-5">
        <div className="flex flex-col gap-4 sm:gap-5">
          <SpendCard data={data} />
          <CategoryBreakdown data={data} />
        </div>

        <div className="flex flex-col gap-4 sm:gap-5">
          <NetWorthCard data={data} />
          <AccountsCard data={data} />
        </div>
      </div>

      <RecentTransactions data={data} />
    </div>
  );
}

/* ------------------------------------------------------------- greeting */

function Greeting({
  data,
  pending,
}: {
  data: DashboardSummary;
  pending: number;
}) {
  /*
   * Derived from the server's `asOf`, not from the browser clock. Reading the
   * local time during render would differ between server and client and warn
   * on hydration — and the server already told us what "now" is.
   */
  const asOf = new Date(data.asOf);
  const hour = asOf.getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  const date = asOf.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-normal text-ink sm:text-[27px]">
        Good {part}
        {data.greetingName ? `, ${data.greetingName}` : ""}
      </h1>
      <p className="mt-0.5 text-sm text-ink-muted">
        {date}
        {pending > 0 && (
          <>
            {" · "}
            <span className="text-attention-ink">
              {pending} {pending === 1 ? "entry" : "entries"} waiting for you
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ attention */

function DueTile({ due }: { due: UpcomingDue }) {
  const date = new Date(due.dueDate);

  return (
    <div className="flex items-center gap-3.5 rounded-[--radius-card] border border-attention-line bg-attention-soft p-4 shadow-[inset_3px_0_0_var(--attention)]">
      <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-attention font-mono leading-[1.05] text-white">
        <span className="text-sm font-semibold">{date.getDate()}</span>
        <span className="text-[8px] uppercase">
          {date.toLocaleDateString("en-IN", { month: "short" })}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{due.label}</p>
        <p className="text-[13px] text-attention-ink">
          {formatMinor(due.amount.amountMinor)}
          {" · "}
          {due.autoDebit
            ? "auto-debit"
            : due.daysUntilDue === 0
              ? "due today"
              : `in ${due.daysUntilDue} days`}
        </p>
      </div>
    </div>
  );
}

function ReviewTile({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-4 rounded-[--radius-card] border border-line-strong bg-paper p-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5">
          <span className="font-display text-[28px] leading-none text-ink">
            {count}
          </span>
          <span className="text-sm text-ink-muted">
            parsed {count === 1 ? "entry" : "entries"} to confirm
          </span>
        </p>
        <p className="mt-1 text-[13px] text-ink-faint">
          Nothing enters your ledger until you say so.
        </p>
      </div>

      <Button asChild size="sm" variant="attention" className="shrink-0">
        <Link href="/review">
          Review now
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------- spend */

function SpendCard({ data }: { data: DashboardSummary }) {
  const { spent, income, budget, versusLastMonth } = data.month;
  const month = new Date(data.asOf).toLocaleDateString("en-IN", {
    month: "long",
  });

  return (
    <section className="rounded-[--radius-card] border border-line-strong bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Spent in {month}</Eyebrow>
          <p className="mt-1">
            <Amount value={spent} size="display" />
          </p>

          {budget ? (
            <p className="mt-1 text-[13px] text-ink-muted">
              of {formatMinor(budget.budget.amountMinor)} budget ·{" "}
              <span className={budget.isOver ? "text-spend" : undefined}>
                {budget.isOver
                  ? `${formatMinor(Math.abs(budget.remaining.amountMinor))} over`
                  : `${formatMinor(budget.remaining.amountMinor)} left`}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-ink-faint">
              No budget set ·{" "}
              <Link href="/reports" className="text-green hover:underline">
                set one
              </Link>
            </p>
          )}

          <Delta comparison={versusLastMonth} className="mt-2" />
        </div>

        <dl className="flex flex-col gap-1.5 text-right">
          <div>
            <dt className="text-xs text-ink-faint">Income</dt>
            <dd>
              <Amount value={income} direction="CREDIT" size="sm" signed />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Expense</dt>
            <dd>
              <Amount
                value={{ ...spent, amountMinor: -spent.amountMinor }}
                direction="DEBIT"
                size="sm"
                signed
              />
            </dd>
          </div>
        </dl>
      </div>

      {budget && (
        <Progress
          className="mt-4"
          value={budget.usedPercent}
          label={`${Math.round(budget.usedPercent)}% of budget used`}
        />
      )}
    </section>
  );
}

/* ----------------------------------------------------------- categories */

function CategoryBreakdown({ data }: { data: DashboardSummary }) {
  if (data.topCategories.length === 0) {
    return (
      <EmptyState title="No spending yet this month">
        Say &ldquo;300 रुपये किराने पे खर्च किए&rdquo; and it lands here.
      </EmptyState>
    );
  }

  const largest = Math.max(
    ...data.topCategories.map((c) => c.spent.amountMinor),
  );

  return (
    <section className="rounded-[--radius-card] border border-line-strong bg-paper p-5">
      <Eyebrow>Where it went</Eyebrow>

      <ul className="mt-3.5 flex flex-col gap-3">
        {data.topCategories.map((slice) => (
          <li key={slice.categoryId ?? slice.name} className="flex items-center gap-3">
            <CategoryMark monogram={slice.monogram} tint={slice.tint} />

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate text-ink-soft">{slice.name}</span>
                <Amount value={slice.spent} size="sm" />
              </div>

              {/*
               * Bars are scaled to the largest category, not to 100%, so the
               * comparison between rows stays readable when the biggest slice
               * is only a fifth of spending.
               */}
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-soft">
                <div
                  className="h-full rounded-full bg-green"
                  style={{
                    width: `${percentOf(slice.spent.amountMinor, largest) ?? 0}%`,
                  }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------ net worth */

function NetWorthCard({ data }: { data: DashboardSummary }) {
  const { assets, liabilities, net } = data.netWorth;

  return (
    <section className="rounded-[--radius-card] border border-line-strong bg-paper p-5">
      <Eyebrow>Net worth</Eyebrow>
      <p
        className={cn(
          "mt-1 font-display text-[28px] leading-none",
          net.amountMinor < 0 ? "text-ink" : "text-ink",
        )}
      >
        {formatCompact(net.amountMinor, net.currency)}
      </p>
      {/*
       * A negative figure early in a home loan is correct, not a bug — the
       * design shows ₹−34.2L. Saying so here stops it reading as an error.
       */}
      <p className="mt-1.5 text-[13px] text-ink-muted">
        {formatCompact(assets.amountMinor)} in assets less{" "}
        {formatCompact(liabilities.amountMinor)} owed
      </p>
    </section>
  );
}

/* ------------------------------------------------------------- accounts */

function AccountsCard({ data }: { data: DashboardSummary }) {
  if (data.accounts.length === 0) {
    return (
      <EmptyState
        title="No accounts yet"
        action={
          <Button asChild size="sm">
            <Link href="/accounts">Add an account</Link>
          </Button>
        }
      >
        Add a bank, card or loan to see balances and due dates.
      </EmptyState>
    );
  }

  return (
    <section className="rounded-[--radius-card] border border-line-strong bg-paper p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>Accounts</Eyebrow>
        <Link
          href="/accounts"
          className="text-xs text-green hover:underline"
        >
          All
        </Link>
      </div>

      <ul className="mt-3.5 flex flex-col gap-3">
        {data.accounts.slice(0, 4).map((account) => (
          <li key={account.id} className="flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-paper-raised font-mono text-[9px] font-semibold text-ink-muted">
              {account.name.slice(0, 2).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-ink">{account.name}</p>
              {account.last4 && (
                <p className="font-mono text-[11px] text-ink-faint">
                  ····{account.last4}
                </p>
              )}
            </div>

            <Amount
              value={{
                amountMinor: account.balanceMinor,
                currency: account.currency,
              }}
              size="sm"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- recent */

function RecentTransactions({ data }: { data: DashboardSummary }) {
  if (data.recentTransactions.length === 0) return null;

  return (
    <section className="rounded-[--radius-card] border border-line-strong bg-paper p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>Recent</Eyebrow>
        <Link href="/transactions" className="text-xs text-green hover:underline">
          All transactions
        </Link>
      </div>

      <ul className="mt-2 divide-y divide-line-soft">
        {data.recentTransactions.slice(0, 6).map((transaction) => (
          <li key={transaction.id} className="flex items-center gap-3 py-2.5">
            {transaction.category ? (
              <CategoryMark
                monogram={transaction.category.monogram}
                tint={transaction.category.tint}
              />
            ) : (
              <span className="size-[26px] shrink-0 rounded-lg bg-paper-raised" />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">
                {transaction.merchant?.normalizedName ??
                  transaction.category?.name ??
                  transaction.note ??
                  "Expense"}
              </p>
              <p className="truncate text-xs text-ink-faint">
                {new Date(transaction.date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
                {transaction.account ? ` · ${transaction.account.name}` : ""}
              </p>
            </div>

            <Amount
              value={{
                amountMinor: transaction.amountMinor,
                currency: transaction.currency,
              }}
              direction={transaction.direction}
              size="sm"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- loading */

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Skeleton className="h-[74px]" />
        <Skeleton className="h-[74px]" />
        <Skeleton className="h-[74px]" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
