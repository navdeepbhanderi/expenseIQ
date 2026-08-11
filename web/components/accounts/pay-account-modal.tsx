"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Chip } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import { useAccounts, usePayAccount } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/client";
import { formatMinor } from "@/lib/money";
import { toLocalISODate } from "@/lib/today";
import type { Account } from "@/lib/api/types";

/**
 * Clears a card bill or a loan EMI from another account.
 *
 * Until this existed the only way to record paying a bill was to log it as an
 * ordinary expense — which counts it twice, because the spending was already
 * captured when the card was swiped. The server writes it as a transfer pair
 * instead, so the money moves and both balances change without anything
 * reaching a spend total.
 *
 * The amount is prefilled with what is actually owed and offered as chips,
 * because "the full outstanding" and "the minimum" are the two answers people
 * give — but it stays editable, since a part payment is a normal thing to make.
 */
export function PayAccountModal({
  open,
  onOpenChange,
  account,
  outstandingMinor,
  minimumMinor,
  emiMinor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account;
  /** What is owed right now. */
  outstandingMinor: number;
  /** Cards only. */
  minimumMinor?: number | null;
  /** Loans only. */
  emiMinor?: number | null;
}) {
  const { activeId } = useProfile();
  const { data: accounts = [] } = useAccounts(activeId);
  const pay = usePayAccount(activeId);
  const { toast } = useToast();

  const isLoan = account.type === "LOAN";
  const suggested = isLoan ? (emiMinor ?? outstandingMinor) : outstandingMinor;

  const [amount, setAmount] = useState<number | null>(suggested || null);
  const [fromAccountId, setFromAccountId] = useState<string | undefined>();
  const [date, setDate] = useState(toLocalISODate(new Date()));

  /*
   * You cannot pay a card with itself, and paying one card with another is a
   * balance transfer — a different thing with its own terms, not this.
   */
  const sources = accounts.filter(
    (a) => a.id !== account.id && a.type !== "LOAN",
  );

  const valid = amount !== null && amount > 0 && Boolean(fromAccountId);

  function submit() {
    if (!amount || !fromAccountId) return;

    void pay
      .mutateAsync({
        accountId: account.id,
        fromAccountId,
        amountMinor: amount,
        date,
      })
      .then(() => {
        toast({
          title: `Paid ${formatMinor(amount)} to ${account.name}`,
          tone: "success",
        });
        onOpenChange(false);
      })
      .catch((error: unknown) =>
        toast({
          title: "Couldn't record that payment",
          description:
            error instanceof ApiError ? error.displayMessage : undefined,
          tone: "error",
        }),
      );
  }

  const shortcuts = [
    { label: isLoan ? "This EMI" : "Full amount", value: suggested },
    ...(minimumMinor ? [{ label: "Minimum due", value: minimumMinor }] : []),
  ].filter((s) => s.value > 0);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isLoan ? "Pay this EMI" : "Clear this bill"}
      description="Moves money between your own accounts — it won't show up as new spending, because the original purchases already did."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button isLoading={pay.isPending} disabled={!valid} onClick={submit}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <AmountInput
            label="How much"
            valueMinor={amount}
            onValueChange={setAmount}
            hint={`${formatMinor(outstandingMinor)} outstanding`}
          />

          {shortcuts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {shortcuts.map((s) => (
                <Chip key={s.label} onClick={() => setAmount(s.value)}>
                  {s.label} · {formatMinor(s.value)}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <Select
          label="Paid from"
          placeholder="Choose an account"
          value={fromAccountId}
          onValueChange={setFromAccountId}
          options={sources.map((a) => ({ value: a.id, label: a.name }))}
          emptyAction={{
            label: "No other account to pay from",
            onSelect: () => onOpenChange(false),
          }}
        />

        <Input
          label="On"
          type="date"
          value={date}
          max={toLocalISODate(new Date())}
          onChange={(e) => setDate(e.target.value)}
        />

        {isLoan && emiMinor && amount !== null && amount < emiMinor && (
          <p className="text-[13px] text-ink-muted">
            Less than one EMI, so this is recorded as a part payment against the
            principal rather than as an instalment.
          </p>
        )}
      </div>
    </Modal>
  );
}
