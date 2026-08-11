"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import { useDeleteAccount, useUpdateAccount } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/client";
import { formatMinor } from "@/lib/money";
import {
  AccountForm,
  toPayload,
  valuesFrom,
} from "./account-form";
import type { Account } from "@/lib/api/types";

/**
 * Edit and delete an account.
 *
 * Deleting is the dangerous one, so the dialog names what goes with it. An
 * account is not a row on its own - transactions point at it, and the balance
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
  const [values, setValues] = useState(() => valuesFrom(account));

  async function save() {
    try {
      await update.mutateAsync({ id: account.id, patch: toPayload(values) });
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            // Re-seeded on open, so the form always reflects the saved
            // account rather than a stale draft from a previous cancel.
            setValues(valuesFrom(account));
            setOpen(true);
          }}
        >
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
              disabled={values.name.trim() === ""}
              onClick={() => void save()}
            >
              Save changes
            </Button>
          </>
        }
      >
        {/* Type is locked: the API has no path for changing an account's
            kind, and a bank account cannot become a loan. */}
        <AccountForm values={values} onChange={setValues} lockType />
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
