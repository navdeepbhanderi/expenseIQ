"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { Chip } from "@/components/ui/controls";
import { CategoryMark } from "@/components/ui/display";
import { ConfidenceDots } from "@/components/ui/feedback";
import { Select } from "@/components/ui/select";
import type { Account, Category, NluCandidate } from "@/lib/api/types";

/**
 * One parsed candidate, as chips — design 5c and 3c.
 *
 * Chips rather than a form, because the design's claim is that confirming
 * should take one tap. A form says "fill this in"; chips say "this is what I
 * heard, correct me if I'm wrong". Only the field that is actually missing
 * opens an editor, and it is marigold and dashed so it reads as the one thing
 * asked of the user — design 3d's "Account? →".
 */
export function CandidateCard({
  candidate,
  categories,
  accounts,
  onChange,
  className,
}: {
  candidate: NluCandidate;
  categories: Category[];
  accounts: Account[];
  onChange: (patch: {
    categoryId?: string | null;
    accountId?: string | null;
  }) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState<"category" | "account" | null>(null);

  const category = categories.find((c) => c.id === candidate.categoryId);
  const account = accounts.find((a) => a.id === candidate.accountId);

  const needsAccount = candidate.missingFields.includes("account");
  const needsCategory = candidate.missingFields.includes("category");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Amount is never a chip you can shrug at — it is the transaction. */}
        <Chip tone="mono">
          {candidate.amountMinor === null
            ? "Amount?"
            : formatMinor(candidate.amountMinor)}
        </Chip>

        {editing === "category" ? (
          <Select
            className="w-44"
            value={candidate.categoryId ?? undefined}
            placeholder="Pick a category"
            onValueChange={(value) => {
              onChange({ categoryId: value });
              setEditing(null);
            }}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
        ) : (
          <Chip
            tone={needsCategory ? "attention" : "default"}
            onClick={() => setEditing("category")}
          >
            {category ? (
              <>
                <CategoryMark
                  monogram={category.monogram}
                  tint={category.tint}
                  size="sm"
                />
                {category.name}
              </>
            ) : (
              "Category? →"
            )}
          </Chip>
        )}

        {candidate.date && (
          <Chip>
            {new Date(candidate.date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </Chip>
        )}

        {editing === "account" ? (
          <Select
            className="w-44"
            value={candidate.accountId ?? undefined}
            placeholder="Pick an account"
            onValueChange={(value) => {
              onChange({ accountId: value });
              setEditing(null);
            }}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
        ) : (
          <Chip
            tone={needsAccount ? "attention" : "default"}
            onClick={() => setEditing("account")}
          >
            {account ? account.name : "Account? →"}
          </Chip>
        )}
      </div>

      {/*
       * The suggestion line — design 3d's "You usually put fuel on HDFC
       * Millennia". Only shown when the account is the missing field, because
       * that is the moment the hint is useful rather than noise.
       */}
      {needsAccount && candidate.suggestedAccounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-faint">
            {candidate.suggestedAccounts[0]!.reason}
          </span>
          {candidate.suggestedAccounts.slice(0, 3).map((suggestion) => (
            <Chip
              key={suggestion.id}
              onClick={() => onChange({ accountId: suggestion.id })}
            >
              {suggestion.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/** The heard-it header — utterance plus confidence, per design 5c. */
export function HeardLine({
  text,
  band,
  className,
}: {
  text: string;
  band: NluCandidate["confidenceBand"];
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <p className="text-[15px] leading-relaxed text-ink-muted">
        &ldquo;{text}&rdquo;
      </p>
      <ConfidenceDots band={band} className="shrink-0" />
    </div>
  );
}
