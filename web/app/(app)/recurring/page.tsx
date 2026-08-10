"use client";

import { useProfile } from "@/components/providers/profile-provider";
import { useState } from "react";
import { Plus, Play } from "lucide-react";
import {
  useConfirmRecurring,
  useCreateRecurring,
  useDeleteRecurring,
  useDetectedRecurring,
  useGenerateDue,
  useRecurringRules,
} from "@/lib/api/misc";
import { useAccounts } from "@/lib/api/accounts";
import { useCategories } from "@/lib/api/hooks";
import { Modal } from "@/components/ui/overlay";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/controls";
import { Amount, Eyebrow } from "@/components/ui/display";
import { ApiError } from "@/lib/api/client";
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
            Salary, rent, EMIs and subscriptions — on a schedule you set.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
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
            Run due now
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

      <AddScheduleModal open={adding} onOpenChange={setAdding} />
    </div>
  );
}

/**
 * Sets up a schedule the user already knows.
 *
 * Income first in the direction control, because this is the screen someone
 * lands on to add a salary — the thing detection is worst at noticing, since
 * a single monthly credit never looks like a pattern until it has happened
 * three times.
 */
function AddScheduleModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { activeId } = useProfile();
  const create = useCreateRecurring(activeId);
  const { data: accounts = [] } = useAccounts(activeId);
  const { data: categories = [] } = useCategories(activeId);
  const { toast } = useToast();

  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState<number | null>(null);
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [cadence, setCadence] = useState("MONTHLY");
  const [accountId, setAccountId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<string | undefined>();

  const day = Number(dayOfMonth);
  const valid = amount !== null && amount > 0 && day >= 1 && day <= 31;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add a schedule"
      description="Entries arrive in your review queue on the day — never straight into the ledger."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={create.isPending}
            disabled={!valid}
            onClick={() => {
              if (!amount) return;
              void create
                .mutateAsync({
                  amountMinor: amount,
                  cadence,
                  dayOfMonth: day,
                  direction,
                  accountId,
                  categoryId,
                })
                .then(() => {
                  toast({ title: "Schedule added", tone: "success" });
                  onOpenChange(false);
                  setAmount(null);
                })
                .catch((error: unknown) =>
                  toast({
                    title: "Couldn't add that schedule",
                    description:
                      error instanceof ApiError
                        ? error.displayMessage
                        : undefined,
                    tone: "error",
                  }),
                );
            }}
          >
            Add schedule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Eyebrow>What is it</Eyebrow>
          <Segmented
            aria-label="Direction"
            className="mt-2 w-full"
            value={direction}
            onValueChange={(value) => setDirection(value as "CREDIT" | "DEBIT")}
            options={[
              { value: "CREDIT", label: "Money in" },
              { value: "DEBIT", label: "Money out" },
            ]}
          />
        </div>

        <AmountInput
          label={direction === "CREDIT" ? "Amount received" : "Amount paid"}
          valueMinor={amount}
          onValueChange={setAmount}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="How often"
            value={cadence}
            onValueChange={setCadence}
            options={[
              { value: "MONTHLY", label: "Every month" },
              { value: "QUARTERLY", label: "Every quarter" },
              { value: "YEARLY", label: "Every year" },
              { value: "WEEKLY", label: "Every week" },
            ]}
          />
          <Input
            label="Day of month"
            inputMode="numeric"
            maxLength={2}
            value={dayOfMonth}
            onChange={(e) =>
              setDayOfMonth(e.target.value.replace(/\D/g, "").slice(0, 2))
            }
            // 31 is safe: the server clamps to the month's last day, so a
            // schedule set for the 31st still fires in February.
            hint={day > 28 ? "Shorter months use their last day" : undefined}
            error={
              dayOfMonth && (day < 1 || day > 31)
                ? "Pick a day between 1 and 31"
                : undefined
            }
          />
        </div>

        <Select
          label={direction === "CREDIT" ? "Lands in" : "Paid from"}
          placeholder="Choose an account"
          value={accountId}
          onValueChange={setAccountId}
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />

        <Select
          label="Category"
          placeholder="Optional"
          value={categoryId}
          onValueChange={setCategoryId}
          options={categories
            .filter((c) => (direction === "CREDIT" ? c.isIncome : !c.isIncome))
            .map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
    </Modal>
  );
}
