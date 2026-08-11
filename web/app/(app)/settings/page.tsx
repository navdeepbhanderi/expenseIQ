"use client";

import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useProfile } from "@/components/providers/profile-provider";
import { Avatar, Eyebrow } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/controls";
import { Pill } from "@/components/ui/feedback";
import { useTheme } from "@/lib/theme";
import { ProfileSettings } from "@/components/settings/profile-settings";

/** Settings — profile, appearance, integrations, sign out. */
export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { active, profiles } = useProfile();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <h1 className="font-display text-2xl text-ink sm:text-[27px]">Settings</h1>

      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <Eyebrow>Account</Eyebrow>
        <div className="mt-3 flex items-center gap-3">
          {active && (
            <Avatar initials={active.initials} color={active.avatarColor} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {user?.displayName ?? user?.email}
            </p>
            <p className="truncate text-xs text-ink-faint">{user?.email}</p>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-ink-muted">
          {profiles.length} profile{profiles.length === 1 ? "" : "s"} on this
          login.
        </p>
      </section>

      <ProfileSettings />

      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <Eyebrow>Appearance</Eyebrow>
        <Toggle
          className="mt-3"
          label="Night Ledger"
          description="Warm charcoal instead of paper"
          checked={theme === "dark"}
          onCheckedChange={(next) => setTheme(next ? "dark" : "light")}
        />
      </section>

      <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
        <Eyebrow>Integrations</Eyebrow>
        <ul className="mt-3 flex flex-col gap-3">
          {[
            ["Gmail receipts", "Card alerts become drafts you approve"],
            ["Calendar due dates", "Card and EMI dates in your calendar"],
            ["Google Tasks", "Due dates as tasks"],
          ].map(([title, body]) => (
            <li key={title} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm text-ink">
                  {title}
                  {/*
                   * Honest rather than a dead toggle. These are genuinely
                   * unbuilt — a switch that flips and does nothing is worse
                   * than one that is not there.
                   */}
                  <Pill tone="soon">Soon</Pill>
                </p>
                <p className="text-xs text-ink-faint">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-paper">
        {[
          ["Categories", "/settings/categories"],
          ["Family & profiles", "/family"],
          ["Recurring rules", "/recurring"],
          ["Notifications", "/notifications"],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={href!}
            className="flex items-center justify-between border-b border-line-soft px-5 py-3.5 text-sm text-ink last:border-0 hover:bg-paper-raised"
          >
            {label}
            <ChevronRight className="size-4 text-ink-faint" aria-hidden="true" />
          </Link>
        ))}
      </section>

      <Button
        variant="secondary"
        className="self-start"
        onClick={() => void logout()}
      >
        <LogOut className="size-4" aria-hidden="true" />
        Sign out
      </Button>
    </div>
  );
}
