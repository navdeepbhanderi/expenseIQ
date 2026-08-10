"use client";

import { useProfile } from "@/components/providers/profile-provider";
import {
  useCreateRecurring,
  useDeleteRecurring,
  useDetectedRecurring,
  useRecurringRules,
} from "@/lib/api/misc";
import { Amount, Eyebrow } from "@/components/ui/display";
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
  const create = useCreateRecurring(activeId);
  const remove = useDeleteRecurring(activeId);
  const { toast } = useToast();

  const suggestions = (detected.data ?? []).filter((s) => !s.alreadyConfirmed);

  if (rules.isPending) return <ListSkeleton rows={4} />;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <h1 className="font-display text-2xl text-ink sm:text-[27px]">
        Recurring
      </h1>

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
                  isLoading={create.isPending}
                  onClick={() => {
                    void create
                      .mutateAsync({
                        categoryId: suggestion.categoryId,
                        accountId: suggestion.accountId,
                        merchantId: suggestion.merchantId,
                        amountMinor: suggestion.typicalAmount.amountMinor,
                        cadence: suggestion.cadence,
                      })
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
                    {rule.cadence.toLowerCase()}
                    {rule.autoDebit && <Pill tone="attention">Auto-debit</Pill>}
                  </p>
                  <p className="text-xs text-ink-faint">
                    Next {new Date(rule.nextDueDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>

                <Amount
                  value={{ amountMinor: rule.amountMinor, currency: "INR" }}
                  size="sm"
                />

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
    </div>
  );
}
