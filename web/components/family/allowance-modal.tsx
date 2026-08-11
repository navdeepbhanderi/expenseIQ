"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { AmountInput, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import {
  useRemoveAllowance,
  useSetAllowance,
  type AllowanceStatus,
} from "@/lib/api/family";
import { ApiError } from "@/lib/api/client";

/**
 * Grants the monthly allowance - design 2c's "₹1,200 allowance · ₹740 left".
 *
 * The Family page could already show an allowance and credit one that was due,
 * but nothing could create it, so `allowance` was permanently null and the
 * section never rendered for anyone. Same gap as the spend limits: the read
 * half shipped and the write half did not.
 */
export function AllowanceModal({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current?: AllowanceStatus;
}) {
  const { activeId } = useProfile();
  const save = useSetAllowance(activeId);
  const remove = useRemoveAllowance(activeId);
  const { toast } = useToast();

  const existing = current?.allowance ?? null;

  const [amount, setAmount] = useState<number | null>(
    existing?.amountMinor ?? null,
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    existing ? String(existing.dayOfMonth) : "1",
  );

  const day = Number(dayOfMonth);
  const valid = amount !== null && amount > 0 && day >= 1 && day <= 31;

  async function submit() {
    if (!amount) return;

    try {
      await save.mutateAsync({ amountMinor: amount, dayOfMonth: day });
      toast({
        title: existing ? "Allowance updated" : "Allowance set",
        tone: "success",
      });
      onOpenChange(false);
    } catch (caught) {
      toast({
        title: "Couldn't save that allowance",
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
      title={existing ? "Edit allowance" : "Set an allowance"}
      description="Credited on the same day each month. Spending it is tracked against what was given, not against a budget."
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              className="mr-auto text-spend hover:bg-spend/10"
              isLoading={remove.isPending}
              onClick={() => {
                void remove
                  .mutateAsync()
                  .then(() => {
                    toast({ title: "Allowance stopped", tone: "info" });
                    onOpenChange(false);
                  })
                  .catch(() =>
                    toast({ title: "Couldn't stop it", tone: "error" }),
                  );
              }}
            >
              Stop allowance
            </Button>
          )}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={save.isPending}
            disabled={!valid}
            onClick={() => void submit()}
          >
            {existing ? "Save" : "Set allowance"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <AmountInput
          label="Every month"
          valueMinor={amount}
          onValueChange={setAmount}
        />

        <Input
          label="Credited on"
          inputMode="numeric"
          maxLength={2}
          value={dayOfMonth}
          onChange={(e) =>
            setDayOfMonth(e.target.value.replace(/\D/g, "").slice(0, 2))
          }
          hint={
            day > 28
              ? "Shorter months will use their last day"
              : "Day of the month"
          }
          error={
            dayOfMonth && (day < 1 || day > 31)
              ? "Pick a day between 1 and 31"
              : undefined
          }
        />
      </div>
    </Modal>
  );
}
