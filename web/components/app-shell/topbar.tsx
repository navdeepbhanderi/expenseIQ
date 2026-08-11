"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, LogOut, Moon, Plus, Search, Settings, Sun, User } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { ProfileSwitcher } from "./profile-switcher";
import { useTheme } from "@/lib/theme";
import { useProfile } from "@/components/providers/profile-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useUnreadCount } from "@/lib/api/hooks";

/** Top bar - design 2a's 62px header. */
import { useVoiceEnabled } from "@/lib/voice-preference";

export function Topbar({
  onCapture,
  onManualEntry,
}: {
  onCapture: () => void;
  onManualEntry: () => void;
}) {
  const [voiceEnabled] = useVoiceEnabled();

  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
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
      {/*
       * With voice on this opens the capture sheet, which offers both speech
       * and typing. With voice off it goes straight to the manual form -
       * otherwise the primary action leads to a sheet whose main affordance
       * the user has just switched off.
       */}
      <Button
        size="sm"
        onClick={voiceEnabled ? onCapture : onManualEntry}
        className="hidden lg:inline-flex"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add expense
      </Button>

      {/*
       * Signing out was reachable only from deep inside Settings, which is
       * where people look last. It belongs on every screen.
       */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Your account"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper-sunken text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <User className="size-4" aria-hidden="true" />
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-56 rounded-xl border border-line bg-paper p-1.5 shadow-[var(--shadow-popover)]"
          >
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium text-ink">
                {user?.displayName ?? "Signed in"}
              </p>
              <p className="truncate text-xs text-ink-faint">{user?.email}</p>
            </div>

            <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />

            <DropdownMenu.Item asChild>
              <Link
                href="/settings"
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-soft outline-none data-[highlighted]:bg-paper-raised"
              >
                <Settings className="size-4" aria-hidden="true" />
                Settings
              </Link>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              onSelect={() => void logout()}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-spend outline-none data-[highlighted]:bg-spend/10"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}
