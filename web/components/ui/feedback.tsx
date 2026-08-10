"use client";

import * as RadixProgress from "@radix-ui/react-progress";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

/* -------------------------------------------------- Banner (design 6e) */

export type Tone = "info" | "success" | "warning" | "error" | "attention";

const bannerTones: Record<Tone, { wrap: string; icon: React.ElementType }> = {
  info: { wrap: "border-line bg-paper-raised text-ink-soft", icon: Info },
  success: {
    wrap: "border-income/30 bg-income/10 text-ink-soft",
    icon: CheckCircle2,
  },
  /*
   * Warning and attention are visually the same marigold, and that is
   * intentional — the design gives "needs your eye" exactly one colour. They
   * stay separate names because their meanings differ, and a future palette
   * change might separate them.
   */
  warning: {
    wrap: "border-attention-line bg-attention-soft text-attention-ink",
    icon: TriangleAlert,
  },
  attention: {
    wrap: "border-attention-line bg-attention-soft text-attention-ink",
    icon: TriangleAlert,
  },
  error: { wrap: "border-spend/30 bg-spend/10 text-ink-soft", icon: AlertCircle },
};

export function Banner({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const { wrap, icon: Icon } = bannerTones[tone];

  return (
    <div
      // Errors interrupt; everything else waits its turn. A polite live region
      // for a failed save means the user finds out at the worst moment.
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-[--radius-control] border px-4 py-3",
        wrap,
        className,
      )}
    >
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
      <div className="flex-1 text-sm leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
      {action}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------- Status pill (design 6e) */

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "green" | "attention" | "spend" | "income" | "soon";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border-line-strong bg-paper-raised text-ink-muted",
    green: "border-green/25 bg-green-soft text-green-hover",
    attention: "border-attention-line bg-attention-soft text-attention-ink",
    spend: "border-spend/25 bg-spend/10 text-spend",
    income: "border-income/25 bg-income/10 text-income",
    /*
     * "Soon" — deliberately dashed and unsaturated, and deliberately NOT
     * marigold. Marigold means "needs your eye" in this product; a feature
     * that does not exist yet needs nothing from the user, and borrowing the
     * attention colour for it would dilute the one signal that matters.
     */
    soon: "border-dashed border-line bg-transparent text-ink-faint",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------ Progress (design 6e) */

/**
 * Progress bar.
 *
 * `tone` exists because the same bar means different things: a budget at 96%
 * is marigold (needs your eye), over budget is spend red, everything else is
 * ledger green. The colour is the warning, so it must be driven by the value.
 */
export function Progress({
  value,
  max = 100,
  tone,
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: "green" | "attention" | "spend";
  className?: string;
  label?: string;
}) {
  const percent = max === 0 ? 0 : Math.min(100, (value / max) * 100);

  const resolved =
    tone ?? (percent >= 100 ? "spend" : percent >= 85 ? "attention" : "green");

  const fills = {
    green: "bg-green",
    attention: "bg-attention",
    spend: "bg-spend",
  };

  return (
    <RadixProgress.Root
      value={percent}
      max={100}
      aria-label={label}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-line-soft",
        className,
      )}
    >
      <RadixProgress.Indicator
        className={cn("h-full rounded-full transition-all", fills[resolved])}
        style={{ width: `${percent}%` }}
      />
    </RadixProgress.Root>
  );
}

/* ----------------------------------------------- Confidence (design 2b) */

/**
 * The four-dot confidence meter from design 2b/1a.
 *
 * Dots rather than a percentage because the number is a model's self-report
 * and showing "0.82" invites false precision. Three of four filled reads as
 * "fairly sure", which is exactly what the band means.
 */
export function ConfidenceDots({
  band,
  className,
}: {
  band: "CLEAR" | "FAIRLY_SURE" | "NEEDS_FIELD";
  className?: string;
}) {
  const filled = band === "CLEAR" ? 4 : band === "FAIRLY_SURE" ? 3 : 2;
  const label =
    band === "CLEAR"
      ? "Clear"
      : band === "FAIRLY_SURE"
        ? "Fairly sure"
        : "Needs a field";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="flex gap-[3px]" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full",
              i < filled
                ? band === "NEEDS_FIELD"
                  ? "bg-attention"
                  : "bg-income"
                : "bg-line",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-ink-muted">{label}</span>
    </span>
  );
}

/* -------------------------------------------------- Tooltip (design 6e) */

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="z-50 max-w-64 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs text-ink shadow-[var(--shadow-popover)]"
        >
          {content}
          <RadixTooltip.Arrow className="fill-[var(--paper)]" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/* --------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      // Hidden from assistive tech: a screen reader announcing a shimmering
      // grey box is noise. The live region that replaces it does the telling.
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-line-soft", className)}
    />
  );
}

/* ------------------------------------------------------- Empty state */

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-[--radius-card] border border-dashed border-line px-6 py-10 text-center",
        className,
      )}
    >
      <p className="font-display text-lg text-ink">{title}</p>
      {children && (
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
          {children}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
