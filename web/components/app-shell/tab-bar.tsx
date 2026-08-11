"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic } from "lucide-react";
import { cn } from "@/lib/cn";
import { TAB_ITEMS } from "./nav-items";
import { useProfile } from "@/components/providers/profile-provider";

/**
 * Mobile tab bar with the centre mic - design 4c/5e.
 *
 * The mic is the centre action because voice is the product's main verb, and
 * design 5f is built around thumb reach. It overhangs the bar by 34px with a
 * paper-coloured ring, which is what makes it read as sitting *on* the bar
 * rather than in it.
 *
 * Hidden at lg and above, where the sidebar takes over.
 */
export function TabBar({ onCapture }: { onCapture: () => void }) {
  const pathname = usePathname();
  const { active } = useProfile();
  const pending = active?.pendingReviewCount ?? 0;

  const [first, second, third, fourth] = TAB_ITEMS;

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex items-end justify-between border-t border-line-strong bg-paper px-3.5 pt-2.5 lg:hidden",
        // The home indicator on notched phones sits where a tab would be.
        "pb-[calc(10px+env(safe-area-inset-bottom))]",
      )}
    >
      <Tab item={first!} pathname={pathname} pending={pending} />
      <Tab item={second!} pathname={pathname} pending={pending} />

      <div className="flex w-[66px] justify-center">
        <button
          onClick={onCapture}
          aria-label="Add an expense by voice"
          className={cn(
            "-mt-[34px] flex size-[62px] items-center justify-center rounded-full",
            "border-4 border-paper bg-green text-paper",
            "shadow-[0_12px_24px_-10px_rgba(31,111,92,0.7)]",
            "transition-transform active:scale-95",
          )}
        >
          <Mic className="size-6" aria-hidden="true" />
        </button>
      </div>

      <Tab item={third!} pathname={pathname} pending={pending} />
      <Tab item={fourth!} pathname={pathname} pending={pending} />
    </nav>
  );
}

function Tab({
  item,
  pathname,
  pending,
}: {
  item: (typeof TAB_ITEMS)[number];
  pathname: string;
  pending: number;
}) {
  const isActive =
    item.href === "/dashboard"
      ? pathname === item.href
      : pathname.startsWith(item.href);

  const count = item.badge === "review" ? pending : 0;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex w-[62px] flex-col items-center gap-1 py-1",
        isActive ? "text-green" : "text-ink-faint",
      )}
    >
      <item.icon className="size-[18px]" aria-hidden="true" />
      <span className={cn("text-[11px]", isActive && "font-semibold")}>
        {item.label}
      </span>

      {count > 0 && (
        <span className="tabular absolute -top-1 right-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-attention px-1 font-mono text-[10px] font-semibold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
