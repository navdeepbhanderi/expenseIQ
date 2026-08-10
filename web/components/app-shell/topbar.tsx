"use client";

import Link from "next/link";
import { Bell, Moon, Plus, Search, Sun } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { ProfileSwitcher } from "./profile-switcher";
import { useTheme } from "@/lib/theme";
import { useProfile } from "@/components/providers/profile-provider";
import { useUnreadCount } from "@/lib/api/hooks";

/** Top bar — design 2a's 62px header. */
export function Topbar({ onCapture }: { onCapture: () => void }) {
  const { theme, toggle } = useTheme();
  const { activeId } = useProfile();
  const unread = useUnreadCount(activeId);
  const unreadCount = unread.data?.count ?? 0;

  return (
    <header className="sticky top-0 z-20 flex h-[62px] shrink-0 items-center gap-3 border-b border-line-soft bg-paper px-4 sm:px-5">
      {/* The sidebar carries the logo at lg; below that the bar does. */}
      <Link
        href="/dashboard"
        aria-label="ExpenseIQ home"
        className="lg:hidden"
      >
        <Logo size={26} />
      </Link>

      <ProfileSwitcher className="hidden sm:flex" />

      <div className="flex-1" />

      <Link
        href="/transactions"
        className="hidden w-[280px] items-center gap-2 rounded-[10px] border border-line bg-paper-sunken px-3.5 py-2 text-[13px] text-ink-faint transition-colors hover:border-line-strong xl:flex"
      >
        <Search className="size-3.5" aria-hidden="true" />
        Search transactions
      </Link>

      <IconButton
        aria-label={
          theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
        size="sm"
        onClick={toggle}
      >
        {theme === "dark" ? (
          <Sun className="size-4" aria-hidden="true" />
        ) : (
          <Moon className="size-4" aria-hidden="true" />
        )}
      </IconButton>

      <Link
        href="/notifications"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="relative flex size-9 items-center justify-center rounded-[10px] text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 size-2 rounded-full bg-attention ring-2 ring-paper"
          />
        )}
      </Link>

      {/*
       * Desktop only. On mobile this action is the mic in the tab bar, and
       * two "add expense" affordances on one screen is one too many.
       */}
      <Button size="sm" onClick={onCapture} className="hidden lg:inline-flex">
        <Plus className="size-4" aria-hidden="true" />
        Add expense
      </Button>
    </header>
  );
}
