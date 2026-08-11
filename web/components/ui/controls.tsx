"use client";

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import * as RadixRadio from "@radix-ui/react-radio-group";
import * as RadixSwitch from "@radix-ui/react-switch";
import * as RadixSlider from "@radix-ui/react-slider";
import { Check } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";

/* ------------------------------------------------ Checkbox (design 6c) */

/**
 * Checkbox with an optional count - design 6c's filter list, "Groceries 18".
 * The count comes from the API's facets, so the filter tells you how much it
 * will find before you apply it.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  count,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  count?: number;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          "border-line bg-field",
          "data-[state=checked]:border-green data-[state=checked]:bg-green",
          "disabled:cursor-not-allowed disabled:bg-disabled",
        )}
      >
        <RadixCheckbox.Indicator>
          <Check className="size-3 text-paper" strokeWidth={3} aria-hidden="true" />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>

      <label
        htmlFor={id}
        className="flex flex-1 cursor-pointer items-center justify-between gap-2 text-sm text-ink-soft"
      >
        <span>{label}</span>
        {count !== undefined && (
          <span className="tabular font-mono text-xs text-ink-faint">
            {count}
          </span>
        )}
      </label>
    </div>
  );
}

/* --------------------------------------------- Radio cards (design 6c) */

export interface RadioCardOption {
  value: string;
  label: string;
  /** Secondary line - "SBI Savings · ****8842". */
  description?: string;
  /** Right-hand figure, usually a balance. */
  meta?: string;
  disabled?: boolean;
}

/**
 * Radio cards, used for account pickers.
 *
 * A card rather than a dot because the design shows account name, issuer and
 * balance together - picking an account is a decision made on those numbers,
 * so they belong inside the target you press.
 */
export function RadioCards({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  options: RadioCardOption[];
  className?: string;
  "aria-label": string;
}) {
  return (
    <RadixRadio.Root
      value={value}
      onValueChange={onValueChange}
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-2", className)}
    >
      {options.map((option) => (
        <RadixRadio.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "group flex items-center gap-3 rounded-[var(--radius-control)] border px-3.5 py-3 text-left transition-colors",
            "border-line bg-paper hover:border-line-strong",
            "data-[state=checked]:border-green data-[state=checked]:bg-green-soft",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          <span
            className={cn(
              "flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
              "border-line bg-field",
              "group-data-[state=checked]:border-green",
            )}
          >
            <RadixRadio.Indicator className="size-2.5 rounded-full bg-green" />
          </span>

          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-ink">
              {option.label}
            </span>
            {option.description && (
              <span className="truncate text-xs text-ink-muted">
                {option.description}
              </span>
            )}
          </span>

          {option.meta && (
            <span className="tabular shrink-0 font-mono text-sm text-ink-soft">
              {option.meta}
            </span>
          )}
        </RadixRadio.Item>
      ))}
    </RadixRadio.Root>
  );
}

/* --------------------------------------------------- Toggle (design 6c) */

export function Toggle({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      {label && (
        <label htmlFor={id} className="flex cursor-pointer flex-col">
          <span className="text-sm font-medium text-ink-soft">{label}</span>
          {description && (
            <span className="text-xs text-ink-muted">{description}</span>
          )}
        </label>
      )}
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          "border-line bg-line-soft",
          "data-[state=checked]:border-green data-[state=checked]:bg-green",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <RadixSwitch.Thumb
          className={cn(
            "block size-[18px] translate-x-0.5 rounded-full bg-paper shadow-sm transition-transform",
            "data-[state=checked]:translate-x-[22px]",
          )}
        />
      </RadixSwitch.Root>
    </div>
  );
}

/* ------------------------------------------------ Segmented (design 6c) */

/**
 * Segmented control - the period switcher in design 6c ("This month / Last
 * month / Year"). A radiogroup rather than tabs: it filters what is shown, it
 * does not switch between panels.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  "aria-label": string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex gap-1 rounded-[var(--radius-control)] border border-line-strong bg-paper-raised p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px] transition-colors",
              selected
                ? "bg-paper font-semibold text-ink shadow-sm"
                : "font-medium text-ink-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------- Chips (design 6c) */

/**
 * Multi-select chip. Also the read-only field chip in design 5c's confirm row
 * ("₹300", "◍ Groceries", "Today"), which is why `tone` exists - a missing
 * field is marigold and dashed, per design 3d's "Account? →".
 */
export function Chip({
  children,
  selected,
  tone = "default",
  onClick,
  className,
  ...props
}: {
  children: React.ReactNode;
  selected?: boolean;
  tone?: "default" | "attention" | "mono";
  onClick?: () => void;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const interactive = Boolean(onClick);
  const Comp = interactive ? "button" : "span";

  return (
    <Comp
      onClick={onClick}
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border px-[11px] py-[7px] text-sm transition-colors",
        tone === "attention"
          ? "border-dashed border-attention-line bg-attention-soft text-attention-ink"
          : selected
            ? "border-green bg-green-soft font-medium text-green-hover"
            : "border-line-strong bg-paper-raised text-ink",
        tone === "mono" && "tabular font-mono font-semibold",
        interactive && "hover:border-line",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

/* --------------------------------------------------- Slider (design 6c) */

/**
 * Slider - design 6c's "Slider · monthly limit". Values are paise, so the
 * label formats through the money helper rather than printing a raw number.
 */
export function Slider({
  valueMinor,
  onValueChange,
  minMinor = 0,
  maxMinor = 1_00_000_00,
  stepMinor = 500_00,
  label,
  className,
}: {
  valueMinor: number;
  onValueChange: (minor: number) => void;
  minMinor?: number;
  maxMinor?: number;
  stepMinor?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-ink-soft">{label}</span>
          <span className="tabular font-mono text-sm text-ink">
            {formatMinor(valueMinor)}
          </span>
        </div>
      )}
      <RadixSlider.Root
        value={[valueMinor]}
        onValueChange={([next]) => onValueChange(next ?? minMinor)}
        min={minMinor}
        max={maxMinor}
        step={stepMinor}
        aria-label={label ?? "Amount"}
        className="relative flex h-5 w-full touch-none items-center select-none"
      >
        <RadixSlider.Track className="relative h-1.5 w-full grow rounded-full bg-line-soft">
          <RadixSlider.Range className="absolute h-full rounded-full bg-green" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="block size-5 rounded-full border-2 border-green bg-paper shadow-sm transition-shadow hover:shadow-md" />
      </RadixSlider.Root>
    </div>
  );
}
