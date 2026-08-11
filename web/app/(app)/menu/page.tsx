"use client";

import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { ProfileSwitcher } from "@/components/app-shell/profile-switcher";
import { Eyebrow } from "@/components/ui/display";
import { NAV_ITEMS, TAB_ITEMS } from "@/components/app-shell/nav-items";

/**
 * Mobile menu - the tab bar's fourth slot.
 *
 * Exists because the tab bar carries four targets, not six: Reports and
 * Settings live here rather than shrinking every tab below a comfortable
 * thumb target.
 */
export default function MenuPage() {
  /*
   * Everything the tab bar does not already carry.
   *
   * NAV_ITEMS already contains Family and Recurring, and this page used to
   * append them a second time — so the mobile menu listed both twice, with
   * the Dashboard icon borrowed for the duplicates. Notifications is the only
   * genuine addition: it lives in the top bar on desktop, which does not
   * exist here.
   */
  const items = [
    ...NAV_ITEMS.filter(
      (item) => !TAB_ITEMS.some((tab) => tab.href === item.href),
    ),
    { href: "/notifications", label: "Notifications", icon: Bell },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 lg:hidden">
      <h1 className="font-display text-2xl text-ink">Menu</h1>

      <div>
        <Eyebrow>Profile</Eyebrow>
        <ProfileSwitcher className="mt-2" />
      </div>

      <nav className="overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-paper">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between border-b border-line-soft px-4 py-3.5 text-sm text-ink last:border-0"
          >
            {/* The icon is carried on every item; showing it makes a long
                list scannable instead of a wall of identical rows. */}
            <span className="flex items-center gap-3">
              <item.icon className="size-4 text-ink-muted" aria-hidden="true" />
              {item.label}
            </span>
            <ChevronRight className="size-4 text-ink-faint" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
