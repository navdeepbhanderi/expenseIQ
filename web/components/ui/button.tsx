"use client";

import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Buttons, transcribed from design 6a.
 *
 * The heights are not arbitrary: 40px desktop / 58px mobile come straight off
 * the design, and the mobile size exists because 40px is below the comfortable
 * thumb target on a phone. `size="mobile"` is therefore a real variant, not a
 * responsive tweak — screens 6h and 5g use it deliberately.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tinted"
  | "ghost"
  | "attention"
  | "destructive"
  | "link";

export type ButtonSize = "sm" | "md" | "mobile";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-green text-paper font-semibold hover:bg-green-hover hover:shadow-[var(--shadow-raise)]",
  secondary:
    "border border-line bg-paper text-ink-soft font-medium hover:bg-paper-raised",
  tinted:
    "border border-green/25 bg-green-soft text-green-hover font-semibold hover:border-green/40",
  ghost: "text-ink-muted hover:bg-paper-raised hover:text-ink",
  /*
   * Marigold. Reserved for "needs your eye" — confirming a review item,
   * acting on a due. The design is explicit that attention has exactly one
   * colour; using this for a general primary action breaks that language.
   */
  attention: "bg-attention text-[#3B2E14] font-semibold hover:brightness-105",
  destructive: "bg-spend text-paper font-semibold hover:brightness-110",
  link: "text-green underline-offset-4 hover:underline hover:text-green-hover",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[13px] rounded-[10px] gap-1.5",
  md: "h-10 px-4 text-sm rounded-[--radius-control] gap-2",
  mobile: "h-[58px] px-5 text-[17px] rounded-[--radius-card] gap-2.5 w-full",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  /** Renders as the child element — for wrapping a Next <Link>. */
  asChild?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      // A loading button must not be clickable twice — the second click is a
      // duplicate transaction, not a faster save.
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-all",
        "disabled:pointer-events-none",
        // Disabled is its own colour pair rather than an opacity, because
        // opacity on a bordered button muddies the border into the surface.
        variant !== "link" &&
          variant !== "ghost" &&
          "disabled:bg-disabled disabled:text-disabled-ink disabled:border-transparent disabled:shadow-none",
        (variant === "link" || variant === "ghost") &&
          "disabled:text-disabled-ink",
        variant === "link" ? "h-auto p-0" : sizes[size],
        variants[variant],
        isLoading && "opacity-85",
        className,
      )}
      {...props}
    >
      {isLoading && (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      )}
      {children}
    </Comp>
  );
}

/**
 * Square icon-only button.
 *
 * Requires an accessible name from the caller — an icon alone tells a screen
 * reader nothing, and this is the component where that is easiest to forget.
 */
export function IconButton({
  className,
  variant = "ghost",
  size = "md",
  "aria-label": ariaLabel,
  children,
  ...props
}: Omit<ButtonProps, "asChild" | "isLoading"> & { "aria-label": string }) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-all",
        "disabled:pointer-events-none disabled:text-disabled-ink",
        size === "sm" ? "size-9 rounded-[10px]" : "size-10 rounded-[--radius-control]",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * A primary action with an attached secondary trigger — design 6a's "Split".
 * Used where confirming has a dominant default plus alternatives (confirm and
 * next, confirm and edit).
 */
export function SplitButton({
  children,
  menuLabel,
  onMenuClick,
  className,
  ...props
}: ButtonProps & { menuLabel: string; onMenuClick?: () => void }) {
  return (
    <div className={cn("inline-flex", className)}>
      <Button
        {...props}
        className="rounded-r-none border-r border-r-black/10"
      >
        {children}
      </Button>
      <Button
        variant={props.variant}
        size={props.size}
        aria-label={menuLabel}
        onClick={onMenuClick}
        className="rounded-l-none px-2.5"
      >
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </Button>
    </div>
  );
}
