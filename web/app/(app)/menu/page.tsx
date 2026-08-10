"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProfileSwitcher } from "@/components/app-shell/profile-switcher";
import { Eyebrow } from "@/components/ui/display";
import { NAV_ITEMS } from "@/components/app-shell/nav-items";

/**
 * Mobile menu — the tab bar's fourth slot.
 *
 * Exists because the tab bar carries four targets, not six: Reports and
 * Settings live here rather than shrinking every tab below a comfortable
 * thumb target.
 */
export default function MenuPage() {
  const items = NAV_ITEMS.filter(
    (item) => !["/dashboard", "/review", "/transactions"].includes(item.href),
  );

  return (
    <div className="flex flex-col gap-5 p-4 lg:hidden">
      <h1 className="font-display text-2xl text-ink">Menu</h1>

      <div>
        <Eyebrow>Profile</Eyebrow>
        <ProfileSwitcher className="mt-2" />
      </div>

      <nav className="overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-paper">
        {[...items, { href: "/family", label: "Family", icon: items[0]!.icon },
          { href: "/recurring", label: "Recurring", icon: items[0]!.icon },
          { href: "/notifications", label: "Notifications", icon: items[0]!.icon }]
          .map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between border-b border-line-soft px-4 py-3.5 text-sm text-ink last:border-0"
          >
            {item.label}
            <ChevronRight className="size-4 text-ink-faint" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
