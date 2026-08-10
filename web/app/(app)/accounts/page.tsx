"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useProfile } from "@/components/providers/profile-provider";
import { useAccounts, useCreateAccount } from "@/lib/api/accounts";
import { Amount, Eyebrow } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill, Progress } from "@/components/ui/feedback";
import { AccountsSkeleton } from "@/components/ui/skeletons";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import {
  AccountForm,
  emptyValues,
  toPayload,
  TYPE_LABELS,
} from "@/components/accounts/account-form";
import type { Account, AccountType } from "@/lib/api/types";

/** Accounts list — design 2d's parent, with the add form from 6g. */
export default function AccountsPage() {
  const { activeId, active } = useProfile();
  const { data: accounts, isPending } = useAccounts(activeId);
  const [adding, setAdding] = useState(false);

  // A child profile is refused credit products by the server; hiding the
  // option here saves them hitting a 403, but the server is what enforces it.
  const isChild = active?.kind === "CHILD";

  if (isPending) return <AccountsSkeleton />;

  const grouped = groupByType(accounts ?? []);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink sm:text-[27px]">
          Accounts
        </h1>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add account
        </Button>
      </div>

      {(accounts?.length ?? 0) === 0 ? (
        <EmptyState
          title="No accounts yet"
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              Add your first
            </Button>
          }
        >
          Add a bank, card or loan to see balances, due dates and EMI progress.
        </EmptyState>
      ) : (
        Object.entries(grouped).map(([type, list]) => (
          <section key={type} className="flex flex-col gap-2.5">
            <Eyebrow>{TYPE_LABELS[type as AccountType]}</Eyebrow>
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </ul>
          </section>
        ))
      )}

      <AddAccountModal
        open={adding}
        onOpenChange={setAdding}
        allowCredit={!isChild}
      />
    </div>
  );
}

function groupByType(accounts: Account[]): Record<string, Account[]> {
  const order: AccountType[] = ["BANK", "CREDIT_CARD", "LOAN", "WALLET", "CASH"];
  const grouped: Record<string, Account[]> = {};

  for (const type of order) {
    const list = accounts.filter((a) => a.type === type);
    if (list.length > 0) grouped[type] = list;
  }

  return grouped;
}

function AccountCard({ account }: { account: Account }) {
  const isCard = account.type === "CREDIT_CARD";
  const isLoan = account.type === "LOAN";

  const utilisation =
    isCard && account.creditLimitMinor
      ? (account.balanceMinor / account.creditLimitMinor) * 100
      : null;

  return (
    <li>
      <Link
        href={`/accounts/${account.id}`}
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line-strong bg-paper p-4 transition-colors hover:border-line"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
              {account.name}
              {account.autoDebit && <Pill tone="attention">Auto-debit</Pill>}
            </p>
            <p className="truncate text-xs text-ink-faint">
              {account.issuer ? `${account.issuer} · ` : ""}
              {account.last4 ? `····${account.last4}` : TYPE_LABELS[account.type]}
            </p>
          </div>

          <Amount
            value={{
              amountMinor: account.balanceMinor,
              currency: account.currency,
            }}
            size="sm"
          />
        </div>

        {utilisation !== null && (
          <div>
            <Progress value={utilisation} label="Credit used" />
            <p className="mt-1 text-[11px] text-ink-faint">
              {Math.round(utilisation)}% of limit used
            </p>
          </div>
        )}

        {isLoan && account.tenureMonths && (
          <p className="text-[11px] text-ink-faint">
            {account.emisPaid} of {account.tenureMonths} EMIs paid
          </p>
        )}
      </Link>
    </li>
  );
}

function AddAccountModal({
  open,
  onOpenChange,
  allowCredit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowCredit: boolean;
}) {
  const { activeId } = useProfile();
  const create = useCreateAccount(activeId);
  const { toast } = useToast();
  const [values, setValues] = useState(() => emptyValues());

  async function submit() {
    try {
      await create.mutateAsync(toPayload(values));
      toast({ title: `${values.name.trim()} added`, tone: "success" });
      onOpenChange(false);
      setValues(emptyValues());
    } catch (caught) {
      toast({
        title: "Couldn't add that account",
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
      title="Add account"
      description="Cards and loans unlock due dates and EMI tracking."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            isLoading={create.isPending}
            disabled={values.name.trim() === ""}
            onClick={() => void submit()}
          >
            Add account
          </Button>
        </>
      }
    >
      <AccountForm
        values={values}
        onChange={setValues}
        allowCredit={allowCredit}
      />
    </Modal>
  );
}
