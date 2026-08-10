import {
  CreditCard,
  LayoutGrid,
  ListChecks,
  PieChart,
  Receipt,
  RefreshCw,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shows the pending-review count — the only badge in the nav. */
  badge?: "review";
}

/**
 * The sidebar — design 2a's six, plus Recurring and Family.
 *
 * The design predates both pages existing as destinations, and burying them
 * behind Settings made them undiscoverable on desktop: a feature reachable
 * only by someone who already knows it is there is a feature nobody uses.
 * Mobile keeps four tabs and reaches these through Menu.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/review", label: "Review", icon: ListChecks, badge: "review" },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/accounts", label: "Accounts", icon: CreditCard },
  { href: "/recurring", label: "Recurring", icon: RefreshCw },
  { href: "/reports", label: "Reports", icon: PieChart },
  { href: "/family", label: "Family", icon: Users },
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
