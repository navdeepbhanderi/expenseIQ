"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";
import { Avatar } from "@/components/ui/display";
import { Pill } from "@/components/ui/feedback";
import { useProfile } from "@/components/providers/profile-provider";
import type { ProfileSummary } from "@/lib/api/types";

/**
 * Profile switcher — design 2c.
 *
 * Every row carries its own rollup: month spend, account count, pending
 * reviews. Switching profile is a context change big enough that the user
 * should see what they are switching *to* before they commit, rather than
 * landing somewhere and re-reading the header to work out where they are.
 */
export function ProfileSwitcher({ className }: { className?: string }) {
  const { profiles, active, select } = useProfile();

  if (!active) {
    return (
      <div
        className={cn(
          "h-9 w-44 animate-pulse rounded-full bg-line-soft",
          className,
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "flex items-center gap-2.5 rounded-full border border-line bg-paper-sunken py-1.5 pl-1.5 pr-3 transition-colors hover:border-line-strong",
          className,
        )}
      >
        <Avatar
          initials={active.initials}
          color={active.avatarColor}
          size="sm"
        />
        <span className="text-[13px] font-semibold text-ink">
          {active.name}
          {active.kind !== "SHARED" && (
            <span className="font-normal text-ink-muted">
              {" · "}
              {active.kind === "CHILD" ? "Limited" : "Personal"}
            </span>
          )}
        </span>
        <ChevronDown className="size-3.5 text-ink-faint" aria-hidden="true" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[300px] rounded-xl border border-line bg-paper p-1.5 shadow-[var(--shadow-popover)]"
        >
          {profiles.map((profile) => (
            <DropdownMenu.Item
              key={profile.id}
              onSelect={() => select(profile.id)}
              className="flex cursor-pointer items-start gap-3 rounded-lg p-2.5 outline-none data-[highlighted]:bg-paper-raised"
            >
              <Avatar
                initials={profile.initials}
                color={profile.avatarColor}
                size="md"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {profile.name}
                  </span>
                  {profile.kind === "CHILD" && (
                    <Pill tone="neutral">Limited</Pill>
                  )}
                  {profile.id === active.id && (
                    <Check
                      className="ml-auto size-4 shrink-0 text-green"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <p className="truncate text-xs text-ink-muted">
                  {describe(profile)}
                </p>

                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                  <span className="tabular font-mono text-ink-muted">
                    {formatMinor(profile.monthSpendMinor)}
                  </span>
                  <span>this month</span>
                  {profile.pendingReviewCount > 0 && (
                    <span className="text-attention-ink">
                      · {profile.pendingReviewCount} waiting
                    </span>
                  )}
                </p>
              </div>
            </DropdownMenu.Item>
          ))}

          <DropdownMenu.Separator className="my-1.5 h-px bg-line-soft" />

          {/*
           * Points at Family, where profiles are actually managed. A link to
           * a "new profile" screen that does not exist is worse than one more
           * click — a dead link teaches the user not to trust the menu.
           */}
          <DropdownMenu.Item asChild>
            <Link
              href="/family"
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-soft outline-none data-[highlighted]:bg-paper-raised"
            >
              <Plus className="size-4" aria-hidden="true" />
              Manage profiles
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** "Shared with Meera · 3 accounts" — design 2c's second line. */
function describe(profile: ProfileSummary): string {
  const accounts = `${profile.accountCount} account${profile.accountCount === 1 ? "" : "s"}`;

  if (profile.sharedWith.length === 0) return accounts;

  const names =
    profile.sharedWith.length <= 2
      ? profile.sharedWith.join(" & ")
      : `${profile.sharedWith[0]} +${profile.sharedWith.length - 1}`;

  return `Shared with ${names} · ${accounts}`;
}
