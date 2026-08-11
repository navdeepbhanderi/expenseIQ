"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Chip, Segmented, Toggle } from "@/components/ui/controls";
import { Eyebrow } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import { useAccounts } from "@/lib/api/accounts";
import { useCategories } from "@/lib/api/hooks";
import { useCreateRecurring, useUpdateRecurring } from "@/lib/api/misc";
import { ApiError } from "@/lib/api/client";
import { useRouter } from "next/navigation";
import type { RecurringRule } from "@/lib/api/types";

/** 0 = Sunday, matching JavaScript's getDay and the API. */
const WEEKDAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, i) => ({ value: String(i + 1), label }));

/** The three months a quarterly rule anchored to `month` also lands on. */
function quarterMonths(month: number): string {
  return [0, 3, 6, 9]
    .map((offset) => MONTHS[(month - 1 + offset) % 12]!.label.slice(0, 3))
    .join(" · ");
}

/** How the schedule stops. */
type Ending = "never" | "after" | "on";

/** Today plus `months`, as the yyyy-mm-dd an input[type=date] wants. */
function monthsFromNow(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Creates or edits a schedule - one modal for both.
 *
 * Editing matters as much as creating: a salary changes, rent goes up, and a
 * schedule you cannot amend is one you delete and rebuild from memory.
 *
 * "Last day of the month" is its own choice rather than asking the user to
 * type 31 and trust the clamping. They give the same answer in a long month
 * and different answers to the question "what did you mean" - someone paid on
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
  const router = useRouter();

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
  const [dayOfWeek, setDayOfWeek] = useState(
    rule?.dayOfWeek === null || rule?.dayOfWeek === undefined
      ? "1"
      : String(rule.dayOfWeek),
  );
  const [monthOfYear, setMonthOfYear] = useState(
    rule?.monthOfYear ? String(rule.monthOfYear) : String(new Date().getMonth() + 1),
  );

  /*
   * An ending, which most schedules have.
   *
   * Rent runs until you move and a subscription until you cancel, but an EMI
   * is six or twelve instalments and a lease ends on a date. Without this the
   * only way to stop a finished loan was to remember to delete it, and
   * forgetting meant review-queue entries for a loan already paid off.
   */
  const [ending, setEnding] = useState<Ending>(
    rule?.maxOccurrences ? "after" : rule?.endsOn ? "on" : "never",
  );
  const [count, setCount] = useState(
    rule?.maxOccurrences ? String(rule.maxOccurrences) : "6",
  );
  const [endsOn, setEndsOn] = useState(
    rule?.endsOn ? rule.endsOn.slice(0, 10) : monthsFromNow(12),
  );

  const remaining =
    rule?.maxOccurrences != null
      ? rule.maxOccurrences - rule.occurrenceCount
      : null;

  const day = Number(dayOfMonth);
  const isWeekly = cadence === "WEEKLY";
  /*
   * Quarterly and yearly only land on some months, so they need to be told
   * which. Monthly is on every month by definition and weekly has no months
   * at all, so asking either would be a question with one answer.
   */
  const needsMonth = cadence === "YEARLY" || cadence === "QUARTERLY";
  const dayValid = onMonthEnd || isWeekly || (day >= 1 && day <= 31);
  const endValid =
    ending === "never" ||
    (ending === "after" ? Number(count) >= 1 : Boolean(endsOn));
  const valid = amount !== null && amount > 0 && dayValid && endValid;

  const pending = create.isPending || update.isPending;

  async function submit() {
    if (!amount) return;

    const shared = {
      label: label.trim() || undefined,
      amountMinor: amount,
      cadence,
      autoDebit,
      ...(isWeekly
        ? { dayOfWeek: Number(dayOfWeek) }
        : onMonthEnd
          ? { onMonthEnd: true }
          : { dayOfMonth: day, onMonthEnd: false }),
      ...(needsMonth ? { monthOfYear: Number(monthOfYear) } : {}),
      /*
       * Both cleared when switching back to "never", so changing your mind
       * actually removes the limit rather than leaving a stale one behind.
       */
      ...(ending === "after"
        ? { maxOccurrences: Number(count), endsOn: null }
        : ending === "on"
          ? { endsOn, maxOccurrences: null }
          : { maxOccurrences: null, endsOn: null }),
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
      description="Entries arrive in your review queue on the day - never straight into the ledger."
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
          hint="Optional - but it is how you'll tell this apart from the rest"
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

        {isWeekly && (
          <Select
            label="Which day"
            value={dayOfWeek}
            onValueChange={setDayOfWeek}
            options={WEEKDAYS}
            hint="Otherwise it falls on whichever day you happened to add it"
          />
        )}

        {needsMonth && (
          <Select
            label={cadence === "YEARLY" ? "Which month" : "Starting month"}
            value={monthOfYear}
            onValueChange={setMonthOfYear}
            options={MONTHS}
            hint={
              cadence === "YEARLY"
                ? undefined
                : `Then every three months - ${quarterMonths(Number(monthOfYear))}`
            }
          />
        )}

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

        {/* When it stops - an EMI has a count, a lease has a date. */}
        <div>
          <Eyebrow>Runs until</Eyebrow>
          <Segmented
            aria-label="When the schedule ends"
            className="mt-2 w-full"
            value={ending}
            onValueChange={(value) => setEnding(value as Ending)}
            options={[
              { value: "never", label: "I stop it" },
              { value: "after", label: "A set number" },
              { value: "on", label: "A date" },
            ]}
          />

          {ending === "after" && (
            <div className="mt-3">
              <Input
                label={direction === "CREDIT" ? "How many times" : "How many payments"}
                inputMode="numeric"
                maxLength={3}
                value={count}
                onChange={(e) =>
                  setCount(e.target.value.replace(/\D/g, "").slice(0, 3))
                }
                hint={
                  remaining !== null
                    ? `${remaining} of ${rule?.maxOccurrences} still to go`
                    : "Counts only entries actually created - a repeated run doesn't use one up"
                }
                error={
                  count && Number(count) < 1
                    ? "It has to run at least once"
                    : undefined
                }
              />
              {/* The quick answers, because loans are described this way. */}
              <div className="mt-2 flex flex-wrap gap-2">
                {[3, 6, 12, 24, 36].map((n) => (
                  <Chip key={n} onClick={() => setCount(String(n))}>
                    {n} months
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {ending === "on" && (
            <div className="mt-3">
              <Input
                label="Last one on"
                type="date"
                value={endsOn}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEndsOn(e.target.value)}
                hint="Inclusive - an entry due on this date still arrives"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[6, 12, 24].map((n) => (
                  <Chip key={n} onClick={() => setEndsOn(monthsFromNow(n))}>
                    {n} months
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>

        {!editing && (
          <>
            <Select
              label={direction === "CREDIT" ? "Lands in" : "Paid from"}
              placeholder="Choose an account"
              value={accountId}
              onValueChange={setAccountId}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              emptyAction={{
                label: "No accounts yet - add one",
                onSelect: () => router.push("/accounts"),
              }}
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
            description="Leaves the account on its own - you are told, not asked"
            checked={autoDebit}
            onCheckedChange={setAutoDebit}
          />
        )}
      </div>
    </Modal>
  );
}
