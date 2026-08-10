"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/brand/logo";
import { NAV_ITEMS } from "./nav-items";
import { useProfile } from "@/components/providers/profile-provider";

/**
 * Desktop sidebar — design 2a. 228px, appears at lg and above.
 *
 * The review count is the only badge in the nav, and it is marigold: it is
 * the one place in the app that is actually waiting on the user. Adding a
 * second badge anywhere here would cost this one its meaning.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { active } = useProfile();
  const pending = active?.pendingReviewCount ?? 0;

  return (
    <aside className="hidden w-[228px] shrink-0 flex-col gap-6 border-r border-line-soft bg-paper px-4 py-5 lg:flex">
      <Link href="/dashboard" aria-label="ExpenseIQ home" className="px-1.5">
        <Logo size={30} />
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          // startsWith so /transactions/abc keeps Transactions lit, but not
          // for /dashboard, which would then match everything under it.
          const isActive =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          const count = item.badge === "review" ? pending : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-green-soft font-semibold text-green-hover"
                  : "text-ink-soft hover:bg-paper-raised",
              )}
            >
              <item.icon
                className={cn("size-4", isActive ? "opacity-100" : "opacity-60")}
                aria-hidden="true"
              />
              {item.label}
              {count > 0 && (
                <span className="tabular ml-auto rounded-full bg-attention px-[7px] py-0.5 font-mono text-[11px] font-semibold text-white">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/*
       * Design 2a puts an integrations note here. Gmail parsing is unbuilt —
       * Phase 6b — so this says what is true rather than reporting a count
       * from a feature that does not run.
       */}
      <div className="mt-auto rounded-xl border border-line-soft bg-paper-sunken p-3">
        <p className="text-xs leading-relaxed text-ink-muted">
          Gmail and Calendar parsing are on the way. Everything else is ready.
        </p>
        <Link
          href="/settings/integrations"
          className="mt-2 inline-block text-xs font-semibold text-green hover:underline"
        >
          Manage integrations
        </Link>
      </div>
    </aside>
  );
}
