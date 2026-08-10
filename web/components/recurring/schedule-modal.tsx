"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented, Toggle } from "@/components/ui/controls";
import { Eyebrow } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import { useAccounts } from "@/lib/api/accounts";
import { useCategories } from "@/lib/api/hooks";
import { useCreateRecurring, useUpdateRecurring } from "@/lib/api/misc";
import { ApiError } from "@/lib/api/client";
import type { RecurringRule } from "@/lib/api/types";

/**
 * Creates or edits a schedule — one modal for both.
 *
 * Editing matters as much as creating: a salary changes, rent goes up, and a
 * schedule you cannot amend is one you delete and rebuild from memory.
 *
 * "Last day of the month" is its own choice rather than asking the user to
 * type 31 and trust the clamping. They give the same answer in a long month
 * and different answers to the question "what did you mean" — someone paid on
 * the 31st and someone paid at month end are describing different rules.
 */
export function ScheduleModal({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  rule?: RecurringRule;
}) {
  const { activeId } = useProfile();
  const create = useCreateRecurring(activeId);
  const update = useUpdateRecurring(activeId);
  const { data: accounts = [] } = useAccounts(activeId);
  const { data: categories = [] } = useCategories(activeId);
  const { toast } = useToast();

  const editing = Boolean(rule);

  const [label, setLabel] = useState(rule?.label ?? "");
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">(
    rule?.direction ?? "CREDIT",
  );
  const [amount, setAmount] = useState<number | null>(
    rule?.amountMinor ?? null,
  );
  const [cadence, setCadence] = useState(rule?.cadence ?? "MONTHLY");
  const [onMonthEnd, setOnMonthEnd] = useState(rule?.onMonthEnd ?? false);
  const [dayOfMonth, setDayOfMonth] = useState(
    rule?.dayOfMonth ? String(rule.dayOfMonth) : "1",
  );
  const [accountId, setAccountId] = useState<string | undefined>(
    rule?.accountId ?? undefined,
  );
  const [categoryId, setCategoryId] = useState<string | undefined>(
    rule?.categoryId ?? undefined,
  );
  const [autoDebit, setAutoDebit] = useState(rule?.autoDebit ?? false);

  const day = Number(dayOfMonth);
  const isWeekly = cadence === "WEEKLY";
  const dayValid = onMonthEnd || isWeekly || (day >= 1 && day <= 31);
  const valid = amount !== null && amount > 0 && dayValid;

  const pending = create.isPending || update.isPending;

  async function submit() {
    if (!amount) return;

    const shared = {
      label: label.trim() || undefined,
      amountMinor: amount,
      cadence,
      autoDebit,
      ...(isWeekly
        ? {}
        : onMonthEnd
          ? { onMonthEnd: true }
          : { dayOfMonth: day, onMonthEnd: false }),
    };

    try {
      if (rule) {
        await update.mutateAsync({ ruleId: rule.id, patch: shared });
      } else {
        await create.mutateAsync({ ...shared, direction, accountId, categoryId });
      }

      toast({
        title: editing ? "Schedule updated" : "Schedule added",
        tone: "success",
      });
      onOpenChange(false);
    } catch (caught) {
      toast({
        title: editing
          ? "Couldn't update that schedule"
          : "Couldn't add that schedule",
        description:
          caught instanceof ApiError ? caught.displayMessage : undefined,
        tone: "error",
      });
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit schedule" : "Add a schedule"}
      description="Entries arrive in your review queue on the day — never straight into the ledger."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={pending}
            disabled={!valid}
            onClick={() => void submit()}
          >
            {editing ? "Save changes" : "Add schedule"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          placeholder={direction === "CREDIT" ? "Salary" : "Rent"}
          hint="Optional — but it is how you'll tell this apart from the rest"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        {/* Direction is fixed once created: the API has no path to flip it,
            and an income becoming an expense is a different rule. */}
        {!editing && (
          <div>
            <Eyebrow>What is it</Eyebrow>
            <Segmented
              aria-label="Direction"
              className="mt-2 w-full"
              value={direction}
              onValueChange={(value) =>
                setDirection(value as "CREDIT" | "DEBIT")
              }
              options={[
                { value: "CREDIT", label: "Money in" },
                { value: "DEBIT", label: "Money out" },
              ]}
            />
          </div>
        )}

        <AmountInput
          label={direction === "CREDIT" ? "Amount received" : "Amount paid"}
          valueMinor={amount}
          onValueChange={setAmount}
        />

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

        {!isWeekly && (
          <>
            <Toggle
              label="On the last day of the month"
              description="The 30th in April, the 28th or 29th in February"
              checked={onMonthEnd}
              onCheckedChange={setOnMonthEnd}
            />

            {!onMonthEnd && (
              <Input
                label="Day of month"
                inputMode="numeric"
                maxLength={2}
                value={dayOfMonth}
                onChange={(e) =>
                  setDayOfMonth(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                hint={
                  day > 28
                    ? "Shorter months will use their last day"
                    : undefined
                }
                error={
                  dayOfMonth && (day < 1 || day > 31)
                    ? "Pick a day between 1 and 31"
                    : undefined
                }
              />
            )}
          </>
        )}

        {!editing && (
          <>
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
                .filter((c) =>
                  direction === "CREDIT" ? c.isIncome : !c.isIncome,
                )
                .map((c) => ({ value: c.id, label: c.name }))}
            />
          </>
        )}

        {direction === "DEBIT" && (
          <Toggle
            label="Auto-debit"
            description="Leaves the account on its own — you are told, not asked"
            checked={autoDebit}
            onCheckedChange={setAutoDebit}
          />
        )}
      </div>
    </Modal>
  );
}
