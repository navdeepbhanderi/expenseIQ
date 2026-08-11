"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { Field, type FieldProps } from "./input";

/**
 * Select - design 6c ("Select · closed" / "Select · open").
 *
 * Radix underneath because a native <select> cannot be styled to the design's
 * open panel, and a hand-rolled listbox means owning typeahead, arrow-key
 * traversal, focus return on close and the ARIA wiring. Radix gets all of that
 * right; every pixel here is still ours.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Optional right-aligned detail - an amount, a count, a last-4. */
  meta?: string;
  disabled?: boolean;
}

export interface SelectProps extends FieldProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  /**
   * Shown in place of the list when there are no options.
   *
   * An empty dropdown is a dead end: the user opens it, finds nothing, and
   * has no idea the fix is on another screen. This puts the fix where they
   * are already looking.
   */
  emptyAction?: { label: string; onSelect: () => void };
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled,
  label,
  hint,
  error,
  mobile,
  className,
  name,
  emptyAction,
}: SelectProps) {
  const id = useId();

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      htmlFor={id}
      describedBy={`${id}-desc`}
    >
      <RadixSelect.Root
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        name={name}
      >
        <RadixSelect.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          className={cn(
            "flex w-full items-center justify-between gap-2.5 rounded-[var(--radius-control)]",
            "border border-line bg-field px-[13px] text-sm text-ink transition-colors",
            "hover:border-line-strong data-[placeholder]:text-ink-faint",
            "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink",
            "aria-[invalid=true]:border-spend",
            mobile ? "h-[52px] rounded-[14px] text-base" : "h-10",
            className,
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <ChevronDown className="size-4 text-ink-muted" aria-hidden="true" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={6}
            className={cn(
              "z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden",
              "rounded-xl border border-line bg-paper p-1.5",
              "shadow-[var(--shadow-popover)]",
            )}
          >
            <RadixSelect.Viewport>
              {options.length === 0 && emptyAction && (
                <button
                  type="button"
                  onClick={emptyAction.onSelect}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-green hover:bg-paper-raised"
                >
                  {emptyAction.label}
                </button>
              )}

              {options.length === 0 && !emptyAction && (
                <p className="px-2.5 py-2 text-sm text-ink-faint">
                  Nothing to choose from yet
                </p>
              )}

              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none",
                    "data-[highlighted]:bg-paper-raised",
                    "data-[state=checked]:text-green data-[state=checked]:font-medium",
                    "data-[disabled]:pointer-events-none data-[disabled]:text-disabled-ink",
                  )}
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  {option.meta && (
                    <span className="ml-auto font-mono text-xs text-ink-faint">
                      {option.meta}
                    </span>
                  )}
                  <RadixSelect.ItemIndicator
                    className={option.meta ? "ml-1" : "ml-auto"}
                  >
                    <Check className="size-4" aria-hidden="true" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </Field>
  );
}
