"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCompact, formatMoney, type FormatOptions } from "@/lib/money";
import type { Comparison, Money as MoneyValue } from "@/lib/api/types";

/* ------------------------------------------------------------- Amount */

/**
 * Renders money.
 *
 * Every amount on every screen goes through here so that direction colouring
 * is decided in one place. The rule from the design: red and green mean debit
 * and credit and nothing else — they are never decoration, and a neutral
 * figure (a balance, a limit) stays ink.
 */
export function Amount({
  value,
  direction,
  size = "md",
  compact,
  className,
  ...options
}: {
  value: MoneyValue | null | undefined;
  /** Colours the figure. Omit for neutral figures like balances. */
  direction?: "DEBIT" | "CREDIT";
  size?: "sm" | "md" | "lg" | "display";
  compact?: boolean;
  className?: string;
} & FormatOptions) {
  const sizes = {
    sm: "text-[13px]",
    md: "text-sm",
    lg: "text-lg font-medium",
    // The headline figure — Newsreader, per design 2a's ₹64,210.
    display: "font-display text-[34px] leading-tight font-medium sm:text-[40px]",
  };

  const text =
    compact && value
      ? formatCompact(value.amountMinor, value.currency)
      : formatMoney(value, options);

  return (
    <span
      className={cn(
        "tabular",
        size !== "display" && "font-mono",
        sizes[size],
        direction === "DEBIT" && "text-spend",
        direction === "CREDIT" && "text-income",
        !direction && "text-ink",
        className,
      )}
    >
      {text}
    </span>
  );
}

/**
 * Month-over-month delta — design 6f's "↓ 8% vs July".
 *
 * Down is good here and up is bad, because this compares *spending*. Wiring
 * green to "up" out of habit would congratulate the user for overspending.
 */
export function Delta({
  comparison,
  periodLabel = "last month",
  className,
}: {
  comparison: Comparison;
  periodLabel?: string;
  className?: string;
}) {
  const { deltaPercent, direction } = comparison;

  if (deltaPercent === null || direction === "flat") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-ink-muted", className)}>
        <Minus className="size-3" aria-hidden="true" />
        No change vs {periodLabel}
      </span>
    );
  }

  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        direction === "up" ? "text-spend" : "text-income",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {Math.abs(Math.round(deltaPercent))}% vs {periodLabel}
    </span>
  );
}

/* ----------------------------------------------- Category monogram (2f) */

/**
 * The two-letter category mark.
 *
 * The API supplies `monogram` and `tint` per category, so categories are
 * distinguishable without an icon set that would need a new glyph every time a
 * user invents a category. The tint is a background; the text takes its colour
 * from the surrounding ink so it stays legible in both themes.
 */
export function CategoryMark({
  monogram,
  tint,
  size = "md",
  className,
}: {
  monogram: string;
  tint: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-6 text-[10px] rounded-lg",
    md: "size-[26px] text-[11px] rounded-lg",
    lg: "size-9 text-[13px] rounded-[10px]",
  };

  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: tint }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-mono font-semibold text-[#1B1815]",
        sizes[size],
        className,
      )}
    >
      {monogram}
    </span>
  );
}

/* ------------------------------------------------- Profile avatar (2c) */

export function Avatar({
  initials,
  color,
  size = "md",
  className,
}: {
  initials: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-7 text-[11px]",
    md: "size-9 text-[13px]",
    lg: "size-11 text-base",
  };

  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------ Card surfaces */

export function Card({
  children,
  className,
  as: Comp = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <Comp
      className={cn(
        "rounded-[--radius-card] border border-line-strong bg-paper",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

/** Eyebrow label — mono, uppercase, letterspaced. Used above every panel. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint",
        className,
      )}
    >
      {children}
    </p>
  );
}

/* --------------------------------------------------- Stat card (6f) */

export function StatCard({
  label,
  value,
  detail,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "attention";
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "p-4",
        tone === "attention" &&
          "border-attention-line bg-attention-soft shadow-[inset_3px_0_0_var(--attention)]",
        className,
      )}
    >
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1.5 text-2xl font-medium text-ink">{value}</div>
      {detail && <div className="mt-1 text-[13px] text-ink-muted">{detail}</div>}
    </Card>
  );
}

/* ---------------------------------------------------- Legend (6f) */

export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; value?: string }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs">
          <span
            aria-hidden="true"
            style={{ backgroundColor: item.color }}
            className="size-2 rounded-[2px]"
          />
          <span className="text-ink-muted">{item.label}</span>
          {item.value && (
            <span className="tabular font-mono text-ink">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
