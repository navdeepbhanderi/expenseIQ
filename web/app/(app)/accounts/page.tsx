"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useProfile } from "@/components/providers/profile-provider";
import { useAccounts, useCreateAccount } from "@/lib/api/accounts";
import { Amount, Eyebrow } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill, Progress, Skeleton } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/overlay";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/client";
import { parseAmountToMinor } from "@/lib/money";
import type { Account, AccountType } from "@/lib/api/types";

const TYPE_LABELS: Record<AccountType, string> = {
  BANK: "Bank",
  CREDIT_CARD: "Credit card",
  LOAN: "Loan",
  CASH: "Cash",
  WALLET: "Wallet",
};

/** Accounts list — design 2d's parent, with the add form from 6g. */
export default function AccountsPage() {
  const { activeId, active } = useProfile();
  const { data: accounts, isPending } = useAccounts(activeId);
  const [adding, setAdding] = useState(false);

  // A child profile is refused credit products by the server; hiding the
  // option here saves them hitting a 403, but the server is what enforces it.
  const isChild = active?.kind === "CHILD";

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

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

  const [type, setType] = useState<AccountType>("BANK");
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [last4, setLast4] = useState("");
  const [balance, setBalance] = useState("");
  const [limit, setLimit] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const [dueDay, setDueDay] = useState("");

  const isCard = type === "CREDIT_CARD";

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    try {
      await create.mutateAsync({
        type,
        name: name.trim(),
        ...(issuer.trim() ? { issuer: issuer.trim() } : {}),
        ...(last4.trim() ? { last4: last4.trim() } : {}),
        balanceMinor: parseAmountToMinor(balance) ?? 0,
        ...(isCard && limit
          ? { creditLimitMinor: parseAmountToMinor(limit) ?? undefined }
          : {}),
        ...(isCard && statementDay ? { statementDay: Number(statementDay) } : {}),
        ...(isCard && dueDay ? { dueDay: Number(dueDay) } : {}),
      });

      toast({ title: `${name.trim()} added`, tone: "success" });
      onOpenChange(false);
      setName("");
      setIssuer("");
      setLast4("");
      setBalance("");
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
            type="submit"
            form="add-account"
            isLoading={create.isPending}
            disabled={name.trim() === ""}
          >
            Add account
          </Button>
        </>
      }
    >
      <form id="add-account" onSubmit={submit} className="flex flex-col gap-4">
        <Select
          label="Type"
          value={type}
          onValueChange={(value) => setType(value as AccountType)}
          options={(
            ["BANK", "CASH", "WALLET", "CREDIT_CARD", "LOAN"] as AccountType[]
          )
            .filter(
              (t) =>
                allowCredit || (t !== "CREDIT_CARD" && t !== "LOAN"),
            )
            .map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
        />

        <Input
          label="Name"
          placeholder={isCard ? "HDFC Millennia" : "SBI Savings"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Issuer"
            placeholder="HDFC"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
          />
          <Input
            label="Last 4 digits"
            placeholder="8842"
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
          />
        </div>

        <Input
          label={isCard ? "Outstanding" : "Current balance"}
          placeholder="0"
          inputMode="decimal"
          adornment="₹"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
        />

        {isCard && (
          <>
            <Input
              label="Credit limit"
              placeholder="2,00,000"
              inputMode="decimal"
              adornment="₹"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Statement day"
                placeholder="28"
                inputMode="numeric"
                hint="Day of month"
                value={statementDay}
                onChange={(e) =>
                  setStatementDay(e.target.value.replace(/\D/g, ""))
                }
              />
              <Input
                label="Due day"
                placeholder="12"
                inputMode="numeric"
                hint="Day of month"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
