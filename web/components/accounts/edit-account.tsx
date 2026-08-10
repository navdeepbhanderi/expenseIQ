"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/controls";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import { useDeleteAccount, useUpdateAccount } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/client";
import { formatMinor, parseAmountToMinor } from "@/lib/money";
import type { Account } from "@/lib/api/types";

/**
 * Edit and delete an account.
 *
 * Deleting is the dangerous one, so the dialog names what goes with it. An
 * account is not a row on its own — transactions point at it, and the balance
 * it carries is part of net worth. A confirm that just says "are you sure"
 * gives the user nothing to be sure *about*.
 */
export function EditAccount({ account }: { account: Account }) {
  const router = useRouter();
  const { activeId } = useProfile();
  const update = useUpdateAccount(activeId);
  const remove = useDeleteAccount(activeId);
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState(account.name);
  const [issuer, setIssuer] = useState(account.issuer ?? "");
  const [last4, setLast4] = useState(account.last4 ?? "");
  const [balance, setBalance] = useState(String(account.balanceMinor / 100));
  const [limit, setLimit] = useState(
    account.creditLimitMinor ? String(account.creditLimitMinor / 100) : "",
  );
  const [statementDay, setStatementDay] = useState(
    account.statementDay ? String(account.statementDay) : "",
  );
  const [dueDay, setDueDay] = useState(
    account.dueDay ? String(account.dueDay) : "",
  );
  const [autoDebit, setAutoDebit] = useState(account.autoDebit);
  const [emisPaid, setEmisPaid] = useState(String(account.emisPaid));

  const isCard = account.type === "CREDIT_CARD";
  const isLoan = account.type === "LOAN";

  async function save() {
    try {
      await update.mutateAsync({
        id: account.id,
        patch: {
          name: name.trim(),
          issuer: issuer.trim() || null,
          last4: last4.trim() || null,
          balanceMinor: parseAmountToMinor(balance) ?? account.balanceMinor,
          autoDebit,
          ...(isCard
            ? {
                creditLimitMinor: limit
                  ? parseAmountToMinor(limit)
                  : null,
                statementDay: statementDay ? Number(statementDay) : null,
                dueDay: dueDay ? Number(dueDay) : null,
              }
            : {}),
          ...(isLoan ? { emisPaid: Number(emisPaid) || 0 } : {}),
        },
      });

      toast({ title: "Account updated", tone: "success" });
      setOpen(false);
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
    <>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          className="text-spend hover:bg-spend/10"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Delete
        </Button>
      </div>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Edit ${account.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={update.isPending}
              disabled={!name.trim()}
              onClick={() => void save()}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Issuer"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
            />
            <Input
              label="Last 4 digits"
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <Input
            label={isCard ? "Outstanding" : "Balance"}
            inputMode="decimal"
            adornment="₹"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />

          {isCard && (
            <>
              <Input
                label="Credit limit"
                inputMode="decimal"
                adornment="₹"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Statement day"
                  inputMode="numeric"
                  hint="Day of month"
                  value={statementDay}
                  onChange={(e) =>
                    setStatementDay(e.target.value.replace(/\D/g, ""))
                  }
                />
                <Input
                  label="Due day"
                  inputMode="numeric"
                  hint="Day of month"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </>
          )}

          {isLoan && (
            <Input
              label="EMIs paid"
              inputMode="numeric"
              hint={`of ${account.tenureMonths ?? "?"} total`}
              value={emisPaid}
              onChange={(e) => setEmisPaid(e.target.value.replace(/\D/g, ""))}
            />
          )}

          <Toggle
            label="Auto-debit"
            description="Paid automatically on the due date"
            checked={autoDebit}
            onCheckedChange={setAutoDebit}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${account.name}?`}
        description={
          `Its balance of ${formatMinor(account.balanceMinor)} leaves your net worth. ` +
          `Transactions on this account are kept, but stop being attributed to it.`
        }
        confirmLabel="Delete account"
        isLoading={remove.isPending}
        onConfirm={() => {
          void remove
            .mutateAsync(account.id)
            .then(() => {
              toast({ title: `${account.name} deleted`, tone: "info" });
              router.push("/accounts");
            })
            .catch((error: unknown) =>
              toast({
                title: "Couldn't delete that account",
                description:
                  error instanceof ApiError ? error.displayMessage : undefined,
                tone: "error",
              }),
            );
        }}
      />
    </>
  );
}
