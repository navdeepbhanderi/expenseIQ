import {
  CreditCard,
  LayoutGrid,
  ListChecks,
  PieChart,
  Receipt,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shows the pending-review count — the only badge in the nav. */
  badge?: "review";
}

/** Design 2a's sidebar, in its order. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/review", label: "Review", icon: ListChecks, badge: "review" },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/accounts", label: "Accounts", icon: CreditCard },
  { href: "/reports", label: "Reports", icon: PieChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Design 4c/5e's tab bar — four tabs with the mic between the middle pair.
 *
 * A deliberate subset, not a squeeze of all six. Reports and Settings are
 * reached from Menu, because five tabs plus a FAB leaves each target under
 * 60px on a small phone and the mic is the one that must never be missed.
 */
export const TAB_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid },
  { href: "/review", label: "Review", icon: ListChecks, badge: "review" },
  { href: "/transactions", label: "Spends", icon: Receipt },
  { href: "/menu", label: "Menu", icon: Settings },
];
