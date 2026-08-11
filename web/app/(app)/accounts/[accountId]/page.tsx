"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useProfile } from "@/components/providers/profile-provider";
import { useAccount, usePrepaySimulation } from "@/lib/api/accounts";
import { Amount, Eyebrow } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/input";
import { EmptyState, Pill, Progress } from "@/components/ui/feedback";
import { AccountDetailSkeleton } from "@/components/ui/skeletons";
import { EditAccount } from "@/components/accounts/edit-account";
import { ReminderSettings } from "@/components/accounts/reminder-settings";
import { formatCompact, formatMinor } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { CardPosition, LoanPosition } from "@/lib/api/types";

/**
 * Account detail — design 2d.
 *
 * Every computed figure here (cycle dates, minimum due, amortisation, prepay
 * saving) comes from the server. Recomputing them client-side would mean two
 * implementations of month-end clamping and per-month rounding, and they would
 * disagree the first time February came round.
 */
export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  // Route params are a promise in Next 16.
  const { accountId } = use(params);
  const { activeId } = useProfile();
  const { data, isPending, isError } = useAccount(activeId, accountId);

  if (isPending) return <AccountDetailSkeleton />;

  if (isError || !data) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState title="Account not found">
          It may have been deleted, or belong to another profile.
        </EmptyState>
      </div>
    );
  }

  const { account, card, loan } = data;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Accounts
          </Link>

          <h1 className="mt-2 flex flex-wrap items-center gap-2.5 font-display text-2xl text-ink sm:text-[27px]">
            {account.name}
            {account.autoDebit && <Pill tone="attention">Auto-debit</Pill>}
          </h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {account.issuer ? `${account.issuer} · ` : ""}
            {account.last4 ? `····${account.last4}` : account.type}
          </p>
        </div>

        <EditAccount account={account} />
      </div>

      {card && <CardPanel card={card} />}
      {loan && (
        <LoanPanel
          loan={loan}
          profileId={activeId}
          accountId={accountId}
        />
      )}

      {/* Only cards and loans have a due date to be reminded about. */}
      {(card || loan) && <ReminderSettings accountId={accountId} />}

      {!card && !loan && (
        <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
          <Eyebrow>Balance</Eyebrow>
          <p className="mt-1">
            <Amount
              value={{
                amountMinor: account.balanceMinor,
                currency: account.currency,
              }}
              size="display"
            />
          </p>
        </section>
      )}
    </div>
  );
}

/** Design 2d's card panel. */
function CardPanel({ card }: { card: CardPosition }) {
  return (
    <>
      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Eyebrow>Outstanding</Eyebrow>
            <p className="mt-1">
              <Amount value={card.outstanding} size="display" />
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">
              {formatMinor(card.available.amountMinor)} available of{" "}
              {formatMinor(card.creditLimit.amountMinor)}
            </p>
          </div>

          <div className="text-right">
            <Eyebrow>Minimum due</Eyebrow>
            <p className="mt-1">
              <Amount value={card.minimumDue} size="lg" />
            </p>
          </div>
        </div>

        <Progress
          className="mt-4"
          value={card.utilizationPercent}
          label={`${Math.round(card.utilizationPercent)}% of limit used`}
          // High utilisation is a credit-score problem, not an overspend, so
          // it warns rather than reading as an error.
          tone={card.isHighUtilization ? "attention" : "green"}
        />
        <p className="mt-1.5 text-[11px] text-ink-faint">
          {Math.round(card.utilizationPercent)}% of limit used
          {card.isHighUtilization && " · high utilisation affects your score"}
        </p>
      </section>

      <section
        className={cn(
          "rounded-[var(--radius-card)] border p-5",
          card.cycle.isOverdue
            ? "border-spend/30 bg-spend/10 shadow-[inset_3px_0_0_var(--spend)]"
            : "border-attention-line bg-attention-soft shadow-[inset_3px_0_0_var(--attention)]",
        )}
      >
        <Eyebrow>Current cycle</Eyebrow>
        <p className="mt-1.5 text-sm text-ink">
          Statement{" "}
          <span className="font-semibold">
            {formatDate(card.cycle.lastStatementDate)}
          </span>{" "}
          · due{" "}
          <span className="font-semibold">
            {formatDate(card.cycle.dueDate)}
          </span>
        </p>
        <p
          className={cn(
            "mt-0.5 text-[13px]",
            card.cycle.isOverdue ? "text-spend" : "text-attention-ink",
          )}
        >
          {card.cycle.isOverdue
            ? `${Math.abs(card.cycle.daysUntilDue)} days overdue`
            : card.cycle.daysUntilDue === 0
              ? "Due today"
              : `In ${card.cycle.daysUntilDue} days`}
        </p>

        {/*
         * The next cycle, stated explicitly.
         *
         * Without it, a card whose statement day has not arrived this month
         * shows the *previous* cycle's due date and looks wrong: "statement
         * on the 15th, due on the 5th" reads as the 5th of the same month
         * unless the app says otherwise. It does not — a due day earlier in
         * the month than the statement day always falls in the month after.
         */}
        <p className="mt-3 border-t border-current/10 pt-3 text-[13px] text-ink-muted">
          Next statement{" "}
          <span className="text-ink">
            {formatDate(card.cycle.nextStatementDate)}
          </span>
          , due{" "}
          <span className="text-ink">
            {formatDate(card.cycle.nextDueDate)}
          </span>
        </p>
      </section>
    </>
  );
}

/** Design 2d's loan panel, plus the prepay simulator. */
function LoanPanel({
  loan,
  profileId,
  accountId,
}: {
  loan: LoanPosition;
  profileId: string | null;
  accountId: string;
}) {
  const simulate = usePrepaySimulation(profileId, accountId);
  const [amount, setAmount] = useState<number | null>(5_00_000_00);

  return (
    <>
      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Eyebrow>Outstanding</Eyebrow>
            <p className="mt-1">
              <Amount value={loan.outstanding} size="display" />
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">
              {loan.emisPaid} of {loan.tenureMonths} EMIs paid ·{" "}
              {Math.round(loan.principalClearedPercent)}% principal cleared
            </p>
          </div>

          <div className="text-right">
            <Eyebrow>EMI</Eyebrow>
            <p className="mt-1">
              <Amount value={loan.emi} size="lg" />
            </p>
            {loan.nextEmiDate && (
              <p className="mt-0.5 text-[13px] text-ink-muted">
                Next {formatDate(loan.nextEmiDate)}
              </p>
            )}
          </div>
        </div>

        <Progress
          className="mt-4"
          value={loan.principalClearedPercent}
          tone="green"
          label="Principal cleared"
        />

        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Principal paid", loan.principalPaid],
            ["Interest paid", loan.interestPaid],
            ["Total paid", loan.totalPaid],
            ["Interest over life", loan.totalInterestOverLife],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs text-ink-faint">{label as string}</dt>
              <dd className="tabular mt-0.5 font-mono text-sm text-ink">
                {formatCompact(
                  (value as LoanPosition["emi"]).amountMinor,
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-[13px] text-ink-muted">
          Closes {formatDate(loan.closureDate)}
        </p>
      </section>

      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <Eyebrow>What would a prepayment save?</Eyebrow>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <AmountInput
            label="Lump sum"
            valueMinor={amount}
            onValueChange={setAmount}
            className="sm:max-w-48"
          />
          <Button
            className="sm:mb-[22px]"
            onClick={() => amount && simulate.mutate(amount)}
            isLoading={simulate.isPending}
            disabled={!amount}
          >
            Simulate
          </Button>
        </div>

        {simulate.data && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-income/30 bg-income/10 p-4">
            <p className="text-sm text-ink">
              Paying{" "}
              <span className="font-semibold">
                {formatMinor(simulate.data.prepayment.amountMinor)}
              </span>{" "}
              now saves{" "}
              <span className="font-semibold text-income">
                {formatCompact(simulate.data.interestSaved.amountMinor)}
              </span>{" "}
              in interest and clears the loan{" "}
              <span className="font-semibold">
                {simulate.data.monthsSaved} months
              </span>{" "}
              early.
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">
              New closure {formatDate(simulate.data.newClosureDate)}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
