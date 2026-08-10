"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";

/**
 * Numeric keypad — design 6i.
 *
 * A real keypad rather than `inputMode="numeric"` because the design shows one,
 * and the reason it shows one is sound: the OS numeric keyboard on Android
 * varies by vendor, often includes a comma or a locale decimal that then has
 * to be parsed defensively, and takes half the screen. A fixed 3×4 grid gives
 * consistent, thumb-sized targets and can never emit a character we cannot
 * handle.
 *
 * Digits accumulate as *paise* — pressing 3, 0, 0 makes ₹3.00, exactly like a
 * card terminal. There is no decimal point to mis-place.
 */

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"] as const;

export function AmountKeypad({
  valueMinor,
  onChange,
  className,
}: {
  valueMinor: number;
  onChange: (minor: number) => void;
  className?: string;
}) {
  const press = (key: string) => {
    // Capped so a stuck thumb can't build a number beyond ₹99,99,99,999.99 —
    // past that the display breaks and the value is certainly a mistake.
    const next = Number(`${valueMinor}${key}`);
    if (Number.isSafeInteger(next) && next <= 99_99_99_999_99) onChange(next);
  };

  const backspace = () => onChange(Math.floor(valueMinor / 10));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div
        className="flex min-h-[56px] items-center justify-center"
        // The figure updates as digits land; announcing every keystroke would
        // be noise, so only the final value is polite-announced.
        aria-live="polite"
        aria-atomic="true"
      >
        <span
          className={cn(
            "tabular font-display text-[40px] font-medium",
            valueMinor === 0 ? "text-ink-faint" : "text-ink",
          )}
        >
          {formatMinor(valueMinor, "INR", { paise: true })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className={cn(
              "h-14 rounded-[14px] border border-line bg-paper text-xl font-medium text-ink",
              "transition-colors active:bg-paper-raised",
            )}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          aria-label="Delete last digit"
          className={cn(
            "flex h-14 items-center justify-center rounded-[14px] border border-line bg-paper-raised",
            "text-ink-muted transition-colors active:bg-line-soft",
          )}
        >
          <Delete className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
