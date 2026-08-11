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
import { useEditReviewItem } from "@/lib/api/nlu";
import { ApiError } from "@/lib/api/client";
import { MerchantInput } from "@/components/capture/merchant-input";
import { toLocalISODate } from "@/lib/today";
import type { Account, Category, NluCandidate } from "@/lib/api/types";

/**
 * Corrects everything the chips cannot.
 *
 * The review row lets you swap the category and the account inline, which
 * covers the common case. It does not let you fix an amount the parser heard
 * as 3000 instead of 300, a date, a merchant or a note - and those were
 * unreachable, so the only remedy was to discard the entry and say it again,
 * hoping for a better parse.
 *
 * Saving goes through PATCH rather than folding the values into confirm.
 * The server records each changed field as a Correction, and those are the
 * feedback loop behind the accuracy figure and the category learning. A value
 * quietly overridden at confirm time teaches the system nothing, which is the
 * difference between a parser that improves and one that does not.
 */
export function ReviewEditModal({
  open,
  onOpenChange,
  item,
  categories,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: NluCandidate & { reviewItemId: string };
  categories: Category[];
  accounts: Account[];
}) {
  const { activeId } = useProfile();
  const edit = useEditReviewItem(activeId);
  const { toast } = useToast();

  const [direction, setDirection] = useState(item.direction);
  const [amount, setAmount] = useState<number | null>(item.amountMinor);
  const [date, setDate] = useState(
    item.date ? item.date.slice(0, 10) : toLocalISODate(new Date()),
  );
  const [categoryId, setCategoryId] = useState(item.categoryId ?? undefined);
  const [accountId, setAccountId] = useState(item.accountId ?? undefined);
  const [merchant, setMerchant] = useState(item.merchant ?? "");
  const [note, setNote] = useState(item.note ?? "");

  const valid = amount !== null && amount > 0;

  function save() {
    if (!amount) return;

    /*
     * Only what actually changed.
     *
     * Sending every field would record a Correction for each one, and the
     * accuracy figure counts corrections - so re-saving an untouched entry
     * would report the parser as having got everything wrong.
     */
    const patch: Record<string, unknown> = {};
    if (amount !== item.amountMinor) patch.amountMinor = amount;
    if (direction !== item.direction) patch.direction = direction;
    if (date !== item.date?.slice(0, 10)) patch.date = date;
    if (categoryId !== (item.categoryId ?? undefined)) {
      patch.categoryId = categoryId;
    }
    if (accountId !== (item.accountId ?? undefined)) {
      patch.accountId = accountId;
    }
    if (merchant.trim() !== (item.merchant ?? "")) {
      patch.merchant = merchant.trim();
    }
    if (note.trim() !== (item.note ?? "")) patch.note = note.trim();

    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }

    void edit
      .mutateAsync({ itemId: item.reviewItemId, patch })
      .then(() => {
        toast({ title: "Entry corrected", tone: "success" });
        onOpenChange(false);
      })
      .catch((error: unknown) =>
        toast({
          title: "Couldn't save that correction",
          description:
            error instanceof ApiError ? error.displayMessage : undefined,
          tone: "error",
        }),
      );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Fix this entry"
      description="Still nothing in the ledger - you confirm it after."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button isLoading={edit.isPending} disabled={!valid} onClick={save}>
            Save correction
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
          label="Amount"
          valueMinor={amount}
          onValueChange={setAmount}
          hint="Mishearing 300 as 3000 is the one mistake worth checking every time"
        />

        <Input
          label="When"
          type="date"
          value={date}
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
        />

        <Select
          label={direction === "CREDIT" ? "Into" : "Paid from"}
          placeholder="Optional"
          value={accountId}
          onValueChange={setAccountId}
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />

        <MerchantInput value={merchant} onChange={setMerchant} />

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
