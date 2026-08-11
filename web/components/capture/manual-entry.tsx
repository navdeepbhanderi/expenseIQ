"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/controls";
import { Eyebrow } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import { useAccounts } from "@/lib/api/accounts";
import { useCategories } from "@/lib/api/hooks";
import { useCreateTransaction } from "@/lib/api/transactions";
import { ApiError } from "@/lib/api/client";
import { toLocalISODate } from "@/lib/today";
import { useRouter } from "next/navigation";

/**
 * Types an expense in directly, with no model in the loop.
 *
 * Everything else in the product routes through the review queue, because
 * everything else is a guess that needs confirming. This is not a guess — the
 * user typed every field themselves — so it writes to the ledger directly.
 * Sending your own typed input to a queue to be re-confirmed is asking someone
 * to check their own handwriting.
 *
 * It exists for three situations the voice path cannot cover: a browser
 * without speech recognition, a room where speaking aloud is not an option,
 * and a correction the parser keeps getting wrong. It is always available,
 * whether or not voice is switched on.
 */
export function ManualEntry({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { activeId } = useProfile();
  const create = useCreateTransaction(activeId);
  const { data: accounts = [] } = useAccounts(activeId);
  const { data: categories = [] } = useCategories(activeId);
  const { toast } = useToast();
  const router = useRouter();

  const [direction, setDirection] = useState<"DEBIT" | "CREDIT">("DEBIT");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(toLocalISODate(new Date()));
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");

  const valid = amount !== null && amount > 0 && Boolean(date);

  function reset() {
    setAmount(null);
    setMerchant("");
    setNote("");
    // Date, account and direction are deliberately kept: logging several
    // expenses in a row is the common case, and they are usually the same.
  }

  async function submit(addAnother: boolean) {
    if (!amount) return;

    try {
      await create.mutateAsync({
        amountMinor: amount,
        direction,
        date,
        categoryId,
        accountId,
        merchant: merchant.trim() || undefined,
        note: note.trim() || undefined,
      });

      toast({
        title: direction === "CREDIT" ? "Income recorded" : "Expense recorded",
        tone: "success",
      });

      reset();
      if (!addAnother) onOpenChange(false);
    } catch (caught) {
      toast({
        title: "Couldn't save that",
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
      title="Add it yourself"
      description="Goes straight into the ledger — you typed it, so there is nothing to confirm."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Logging a handful at once is common enough to deserve its own
              button rather than reopening the form each time. */}
          <Button
            variant="secondary"
            isLoading={create.isPending}
            disabled={!valid}
            onClick={() => void submit(true)}
          >
            Save &amp; add another
          </Button>
          <Button
            isLoading={create.isPending}
            disabled={!valid}
            onClick={() => void submit(false)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Eyebrow>Money</Eyebrow>
          <Segmented
            aria-label="Direction"
            className="mt-2 w-full"
            value={direction}
            onValueChange={(value) =>
              setDirection(value as "DEBIT" | "CREDIT")
            }
            options={[
              { value: "DEBIT", label: "Out" },
              { value: "CREDIT", label: "In" },
            ]}
          />
        </div>

        <AmountInput
          label={direction === "CREDIT" ? "Amount received" : "Amount spent"}
          valueMinor={amount}
          onValueChange={setAmount}
        />

        <Input
          label="When"
          type="date"
          value={date}
          // A future-dated expense is almost always a typo; the ledger is a
          // record of what happened.
          max={toLocalISODate(new Date())}
          onChange={(e) => setDate(e.target.value)}
        />

        <Select
          label="Category"
          placeholder="Optional"
          value={categoryId}
          onValueChange={setCategoryId}
          options={categories
            .filter((c) => (direction === "CREDIT" ? c.isIncome : !c.isIncome))
            .map((c) => ({ value: c.id, label: c.name }))}
          emptyAction={{
            label: "Create a category",
            onSelect: () => router.push("/settings/categories"),
          }}
        />

        <Select
          label={direction === "CREDIT" ? "Into" : "Paid from"}
          placeholder="Optional"
          value={accountId}
          onValueChange={setAccountId}
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          emptyAction={{
            label: "No accounts yet — add one",
            onSelect: () => router.push("/accounts"),
          }}
        />

        <Input
          label="Where"
          placeholder="Swiggy, D-Mart, the chemist"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
        />

        <Input
          label="Note"
          placeholder="Optional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}
