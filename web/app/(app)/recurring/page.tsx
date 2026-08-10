"use client";

import { useProfile } from "@/components/providers/profile-provider";
import { useState } from "react";
import { Plus, Play } from "lucide-react";
import {
  useConfirmRecurring,
  useDeleteRecurring,
  useDetectedRecurring,
  useGenerateDue,
  useRecurringRules,
} from "@/lib/api/misc";
import { ScheduleModal } from "@/components/recurring/schedule-modal";
import { Amount, Eyebrow } from "@/components/ui/display";
import type { RecurringRule } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill } from "@/components/ui/feedback";
import { ListSkeleton } from "@/components/ui/skeletons";
import { useToast } from "@/components/ui/toast";
import { formatMinor } from "@/lib/money";

/**
 * Recurring rules and detected suggestions — design 2e's "Recurring" pill,
 * from the other side.
 *
 * Suggestions are shown before they become rules, which is the design's point:
 * the app noticed a pattern, and the user decides whether it is one. Silently
 * creating rules from inference would generate transactions nobody asked for.
 */
export default function RecurringPage() {
  const { activeId } = useProfile();
  const rules = useRecurringRules(activeId);
  const detected = useDetectedRecurring(activeId);
  const confirmPattern = useConfirmRecurring(activeId);
  const remove = useDeleteRecurring(activeId);
  const generate = useGenerateDue(activeId);
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);

  const suggestions = (detected.data ?? []).filter((s) => !s.alreadyConfirmed);

  if (rules.isPending) return <ListSkeleton rows={4} />;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink sm:text-[27px]">
            Recurring
          </h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Salary, rent, EMIs and subscriptions — on a schedule you set. Due
            entries land in your review queue, never straight in the ledger.
          </p>
        </div>

        <div className="flex gap-2">
          {/*
           * A manual trigger for work that should be automatic.
           *
           * The server has no scheduler — generate-due and reminders/scan are
           * both endpoints waiting for a cron that does not exist yet. Until
           * it does, this is the only thing that turns a due schedule into a
           * review entry, so it is exposed rather than hidden. The tooltip
           * says as much: a user should not be left wondering why their rent
           * never appeared.
           */}
          <Button
            variant="secondary"
            size="sm"
            title="Stages any schedules that have come due into your review queue. This normally runs on its own; for now it needs a nudge."
            isLoading={generate.isPending}
            onClick={() => {
              void generate.mutateAsync().then((result) =>
                toast({
                  title:
                    result.generated > 0
                      ? `${result.generated} staged for review`
                      : "Nothing due yet",
                  description:
                    result.generated > 0
                      ? "They're waiting in your review queue, not the ledger."
                      : undefined,
                  tone: "info",
                }),
              );
            }}
          >
            <Play className="size-3.5" aria-hidden="true" />
            Check what&rsquo;s due
          </Button>

          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add schedule
          </Button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-attention-line bg-attention-soft p-5">
          <Eyebrow>Noticed in your history</Eyebrow>
          <p className="mt-1 text-[13px] text-attention-ink">
            These look regular. Confirm one and it will be expected each cycle.
          </p>

          <ul className="mt-3.5 flex flex-col gap-3">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.signature}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-line bg-paper p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {suggestion.merchantName ?? "Regular payment"}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {suggestion.cadence.toLowerCase()} ·{" "}
                    {suggestion.occurrences} times ·{" "}
                    {formatMinor(suggestion.typicalAmount.amountMinor)} typical
                    {suggestion.amountVariancePercent > 20 &&
                      " · amount varies"}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="attention"
                  isLoading={confirmPattern.isPending}
                  onClick={() => {
                    // The endpoint accepts a signature and nothing else; the
                    // rule's fields come from the detection it names.
                    void confirmPattern
                      .mutateAsync({ signature: suggestion.signature })
                      .then(() =>
                        toast({ title: "Rule created", tone: "success" }),
                      )
                      .catch(() =>
                        toast({
                          title: "Couldn't create that rule",
                          tone: "error",
                        }),
                      );
                  }}
                >
                  Confirm
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <Eyebrow>Your rules</Eyebrow>

        {(rules.data?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No recurring rules yet. Rent, EMIs and subscriptions get detected
            from your own history once there is enough of it.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {rules.data!.map((rule) => (
              <li key={rule.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm text-ink">
                    {rule.label ?? describeSchedule(rule)}
                    {rule.direction === "CREDIT" && (
                      <Pill tone="income">Income</Pill>
                    )}
                    {rule.autoDebit && <Pill tone="attention">Auto-debit</Pill>}
                  </p>
                  <p className="truncate text-xs text-ink-faint">
                    {rule.label ? `${describeSchedule(rule)} · ` : ""}
                    {rule.nextDueDate
                      ? `next ${new Date(rule.nextDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                      : "no date set"}
                  </p>
                </div>

                <Amount
                  value={{ amountMinor: rule.amountMinor, currency: "INR" }}
                  direction={rule.direction}
                  size="sm"
                />

                <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove.mutateAsync(rule.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {suggestions.length === 0 && (rules.data?.length ?? 0) === 0 && (
        <EmptyState title="Nothing regular yet">
          A few months of history and rent, EMIs and subscriptions will show up
          here on their own.
        </EmptyState>
      )}

      <ScheduleModal open={adding} onOpenChange={setAdding} />

      {/* Keyed by id so switching rules re-seeds the form rather than
          carrying the previous rule's values across. */}
      {editing && (
        <ScheduleModal
          key={editing.id}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          rule={editing}
        />
      )}
    </div>
  );
}

/** "Monthly on the 1st", "Monthly on the last day". */
function describeSchedule(rule: RecurringRule): string {
  const every = rule.cadence.toLowerCase();

  if (rule.cadence === "WEEKLY") return "Weekly";
  if (rule.onMonthEnd) return `${every} on the last day`;
  if (!rule.dayOfMonth) return every;

  return `${every} on the ${ordinal(rule.dayOfMonth)}`;
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? "st"
      : n % 10 === 2 && n !== 12
        ? "nd"
        : n % 10 === 3 && n !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}
