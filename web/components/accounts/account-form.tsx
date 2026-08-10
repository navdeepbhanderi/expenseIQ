"use client";


import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/controls";
import { Eyebrow } from "@/components/ui/display";
import { parseAmountToMinor } from "@/lib/money";
import type { Account, AccountType } from "@/lib/api/types";

export const TYPE_LABELS: Record<AccountType, string> = {
  BANK: "Bank",
  CREDIT_CARD: "Credit card",
  LOAN: "Loan",
  CASH: "Cash",
  WALLET: "Wallet",
};

/**
 * The account form, shared by add and edit.
 *
 * One component because the fields are identical and the API takes the same
 * shape either way — two forms drift, and the loan fields going missing from
 * one of them is exactly how that shows up.
 *
 * Every field the API accepts is here. A loan without its interest rate and
 * tenure cannot produce an amortisation schedule, so the panel that is the
 * whole point of adding a loan renders empty.
 */

export interface AccountFormValues {
  type: AccountType;
  name: string;
  issuer: string;
  last4: string;
  balance: string;
  // card
  creditLimit: string;
  statementDay: string;
  dueDay: string;
  minDuePercent: string;
  // loan
  principal: string;
  emiAmount: string;
  interestRate: string;
  tenureMonths: string;
  emisPaid: string;
  firstEmiDate: string;
  isFloatingRate: boolean;
  autoDebit: boolean;
}

export function emptyValues(type: AccountType = "BANK"): AccountFormValues {
  return {
    type,
    name: "",
    issuer: "",
    last4: "",
    balance: "",
    creditLimit: "",
    statementDay: "",
    dueDay: "",
    minDuePercent: "5",
    principal: "",
    emiAmount: "",
    interestRate: "",
    tenureMonths: "",
    emisPaid: "0",
    firstEmiDate: "",
    isFloatingRate: false,
    autoDebit: false,
  };
}

export function valuesFrom(account: Account): AccountFormValues {
  const major = (minor: number | null) =>
    minor === null ? "" : String(minor / 100);

  return {
    type: account.type,
    name: account.name,
    issuer: account.issuer ?? "",
    last4: account.last4 ?? "",
    balance: major(account.balanceMinor),
    creditLimit: major(account.creditLimitMinor),
    statementDay: account.statementDay ? String(account.statementDay) : "",
    dueDay: account.dueDay ? String(account.dueDay) : "",
    minDuePercent: account.minDuePercent ? String(account.minDuePercent) : "5",
    principal: major(account.principalMinor),
    emiAmount: major(account.emiAmountMinor),
    interestRate: account.interestRate ? String(account.interestRate) : "",
    tenureMonths: account.tenureMonths ? String(account.tenureMonths) : "",
    emisPaid: String(account.emisPaid),
    firstEmiDate: account.firstEmiDate?.slice(0, 10) ?? "",
    isFloatingRate: account.isFloatingRate,
    autoDebit: account.autoDebit,
  };
}

/** Turns form strings into the API's payload, omitting anything left blank. */
export function toPayload(v: AccountFormValues): Record<string, unknown> {
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const money = (s: string) =>
    s.trim() === "" ? undefined : (parseAmountToMinor(s) ?? undefined);

  const base: Record<string, unknown> = {
    type: v.type,
    name: v.name.trim(),
    issuer: v.issuer.trim() || undefined,
    last4: v.last4.trim() || undefined,
    balanceMinor: money(v.balance) ?? 0,
    autoDebit: v.autoDebit,
  };

  if (v.type === "CREDIT_CARD") {
    Object.assign(base, {
      creditLimitMinor: money(v.creditLimit),
      statementDay: num(v.statementDay),
      dueDay: num(v.dueDay),
      minDuePercent: num(v.minDuePercent),
    });
  }

  if (v.type === "LOAN") {
    Object.assign(base, {
      principalMinor: money(v.principal),
      emiAmountMinor: money(v.emiAmount),
      interestRate: num(v.interestRate),
      tenureMonths: num(v.tenureMonths),
      emisPaid: num(v.emisPaid) ?? 0,
      firstEmiDate: v.firstEmiDate || undefined,
      isFloatingRate: v.isFloatingRate,
    });
  }

  // Blank optional fields are dropped rather than sent as null, so editing an
  // account without touching a field cannot clear it by accident.
  return Object.fromEntries(
    Object.entries(base).filter(([, value]) => value !== undefined),
  );
}

export function AccountForm({
  values,
  onChange,
  allowCredit = true,
  lockType = false,
}: {
  values: AccountFormValues;
  onChange: (values: AccountFormValues) => void;
  /** CHILD profiles are refused credit products by the server. */
  allowCredit?: boolean;
  /** Editing cannot change an account's type — the API has no path for it. */
  lockType?: boolean;
}) {
  const set = <K extends keyof AccountFormValues>(
    key: K,
    value: AccountFormValues[K],
  ) => onChange({ ...values, [key]: value });

  const digits = (s: string) => s.replace(/\D/g, "");
  const isCard = values.type === "CREDIT_CARD";
  const isLoan = values.type === "LOAN";

  return (
    <div className="flex flex-col gap-4">
      {!lockType && (
        <Select
          label="Type"
          value={values.type}
          onValueChange={(value) => set("type", value as AccountType)}
          options={(
            ["BANK", "CASH", "WALLET", "CREDIT_CARD", "LOAN"] as AccountType[]
          )
            .filter((t) => allowCredit || (t !== "CREDIT_CARD" && t !== "LOAN"))
            .map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
        />
      )}

      <Input
        label="Name"
        placeholder={
          isCard ? "HDFC Millennia" : isLoan ? "Home loan" : "SBI Savings"
        }
        value={values.name}
        onChange={(e) => set("name", e.target.value)}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Issuer"
          placeholder={isLoan ? "SBI" : "HDFC"}
          value={values.issuer}
          onChange={(e) => set("issuer", e.target.value)}
        />
        <Input
          label="Last 4 digits"
          placeholder="8842"
          inputMode="numeric"
          maxLength={4}
          value={values.last4}
          onChange={(e) => set("last4", digits(e.target.value))}
        />
      </div>

      {!isLoan && (
        <Input
          label={isCard ? "Outstanding" : "Current balance"}
          placeholder="0"
          inputMode="decimal"
          adornment="₹"
          value={values.balance}
          onChange={(e) => set("balance", e.target.value)}
        />
      )}

      {isCard && (
        <>
          <Input
            label="Credit limit"
            placeholder="2,00,000"
            inputMode="decimal"
            adornment="₹"
            value={values.creditLimit}
            onChange={(e) => set("creditLimit", e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Statement day"
              placeholder="28"
              inputMode="numeric"
              maxLength={2}
              hint="Day of month"
              value={values.statementDay}
              onChange={(e) => set("statementDay", digits(e.target.value))}
            />
            <Input
              label="Due day"
              placeholder="12"
              inputMode="numeric"
              maxLength={2}
              // The case that confuses everyone: a due day earlier in the
              // month than the statement day lands in the NEXT month.
              hint={
                values.statementDay &&
                values.dueDay &&
                Number(values.dueDay) < Number(values.statementDay)
                  ? "Falls the following month"
                  : "Day of month"
              }
              value={values.dueDay}
              onChange={(e) => set("dueDay", digits(e.target.value))}
            />
          </div>

          <Input
            label="Minimum due"
            placeholder="5"
            inputMode="decimal"
            suffix="%"
            hint="Percentage of the outstanding your issuer asks for"
            value={values.minDuePercent}
            onChange={(e) => set("minDuePercent", e.target.value)}
          />
        </>
      )}

      {isLoan && (
        <>
          <Eyebrow>Loan terms</Eyebrow>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Principal"
              placeholder="35,00,000"
              inputMode="decimal"
              adornment="₹"
              hint="The amount borrowed"
              value={values.principal}
              onChange={(e) => set("principal", e.target.value)}
            />
            <Input
              label="EMI"
              placeholder="29,800"
              inputMode="decimal"
              adornment="₹"
              hint="Monthly instalment"
              value={values.emiAmount}
              onChange={(e) => set("emiAmount", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Interest rate"
              placeholder="8.5"
              inputMode="decimal"
              suffix="%"
              hint="Annual"
              value={values.interestRate}
              onChange={(e) => set("interestRate", e.target.value)}
            />
            <Input
              label="Tenure"
              placeholder="240"
              inputMode="numeric"
              suffix="mo"
              hint="Total months"
              value={values.tenureMonths}
              onChange={(e) => set("tenureMonths", digits(e.target.value))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="EMIs already paid"
              placeholder="0"
              inputMode="numeric"
              value={values.emisPaid}
              onChange={(e) => set("emisPaid", digits(e.target.value))}
            />
            <Input
              label="First EMI date"
              type="date"
              value={values.firstEmiDate}
              onChange={(e) => set("firstEmiDate", e.target.value)}
            />
          </div>

          {/*
           * Without rate and tenure the server cannot amortise, and the panel
           * that is the entire reason for adding a loan renders empty.
           */}
          {(!values.interestRate || !values.tenureMonths) && (
            <p className="text-xs text-attention-ink">
              Interest rate and tenure are needed to work out your EMI
              schedule, interest paid and closure date.
            </p>
          )}

          <Toggle
            label="Floating rate"
            description="Rate can change over the loan's life"
            checked={values.isFloatingRate}
            onCheckedChange={(next) => set("isFloatingRate", next)}
          />
        </>
      )}

      <Toggle
        label="Auto-debit"
        description="Paid automatically on the due date"
        checked={values.autoDebit}
        onCheckedChange={(next) => set("autoDebit", next)}
      />
    </div>
  );
}
