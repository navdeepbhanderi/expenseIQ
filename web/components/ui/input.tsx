"use client";

import { forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMinor, parseAmountToMinor } from "@/lib/money";

/** Shared field chrome — 40px, 11px radius, sunken field colour (design 6b). */
const fieldBase =
  "h-10 w-full rounded-[var(--radius-control)] border border-line bg-field px-[13px] text-sm text-ink " +
  "placeholder:text-ink-faint transition-colors " +
  "hover:border-line-strong " +
  "disabled:bg-disabled disabled:text-disabled-ink disabled:cursor-not-allowed " +
  "aria-[invalid=true]:border-spend";

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  /** 58px controls for mobile forms — design 6h. */
  mobile?: boolean;
}

/**
 * Wraps a control with its label, hint and error.
 *
 * The error is wired through `aria-describedby` and `role="alert"` rather than
 * just coloured red — a sighted user sees the red border, and everyone else
 * needs the association to know which field failed and why.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  describedBy,
  children,
  className,
}: FieldProps & {
  htmlFor?: string;
  describedBy?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-[13px] font-medium text-ink-soft"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={describedBy} role="alert" className="text-xs text-spend">
          {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    FieldProps {
  /**
   * Named `adornment` rather than `prefix` because HTML already has a global
   * `prefix` attribute typed as string, and shadowing it with a ReactNode
   * makes the whole props interface fail to extend the DOM one.
   */
  adornment?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, mobile, adornment, suffix, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = `${inputId}-desc`;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      describedBy={describedBy}
    >
      <div className="relative flex items-center">
        {adornment && (
          <span className="pointer-events-none absolute left-[13px] text-sm text-ink-muted">
            {adornment}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ?? error ? describedBy : undefined}
          className={cn(
            fieldBase,
            mobile && "h-[52px] rounded-[14px] text-base",
            adornment && "pl-8",
            suffix && "pr-10",
            className,
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-[13px] text-sm text-ink-muted">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
});

/**
 * Amount input.
 *
 * Holds the *text* the user typed and reports paise upward, rather than being
 * controlled by a number. Controlling it by number is the classic bug: typing
 * "10." round-trips to 10 and the decimal point vanishes as you type it, and
 * "3 lakh" cannot be expressed at all.
 *
 * Accepts everything parseAmountToMinor accepts — "1,24,860", "3 lakh", "5k" —
 * because people type amounts the way they say them.
 */
export function AmountInput({
  valueMinor,
  onValueChange,
  label = "Amount",
  mobile,
  error,
  hint,
  className,
  ...props
}: Omit<InputProps, "value" | "onChange" | "adornment"> & {
  valueMinor: number | null;
  onValueChange: (minor: number | null) => void;
}) {
  const [text, setText] = useState(() =>
    valueMinor === null ? "" : String(valueMinor / 100),
  );
  const [touched, setTouched] = useState(false);

  const parsed = parseAmountToMinor(text);
  const isInvalid = touched && text.trim() !== "" && parsed === null;

  return (
    <Input
      {...props}
      label={label}
      mobile={mobile}
      inputMode="decimal"
      adornment="₹"
      value={text}
      error={error ?? (isInvalid ? "Enter an amount like 300 or 3 lakh" : undefined)}
      // Echo the parsed value back so the user can see "3 lakh" was understood
      // as ₹3,00,000 before they commit to it.
      hint={
        hint ??
        (!isInvalid && parsed !== null && text.trim() !== ""
          ? formatMinor(parsed)
          : undefined)
      }
      onBlur={(event) => {
        setTouched(true);
        props.onBlur?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        onValueChange(parseAmountToMinor(next));
      }}
      className={cn("tabular font-mono", className)}
    />
  );
}

/** Password field with a reveal toggle — design 6b. */
export function PasswordInput({
  label = "Password",
  className,
  ...props
}: InputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        label={label}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // The label states the action, not the state — "Show password" is what
        // pressing it does. Announcing the current state instead is a common
        // and confusing inversion.
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-1 top-[26px] flex size-9 items-center justify-center rounded-lg text-ink-muted hover:text-ink"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(function Textarea({ className, label, hint, error, id, ...props }, ref) {
  const generatedId = useId();
  const areaId = id ?? generatedId;
  const describedBy = `${areaId}-desc`;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      htmlFor={areaId}
      describedBy={describedBy}
    >
      <textarea
        ref={ref}
        id={areaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ?? error ? describedBy : undefined}
        className={cn(fieldBase, "h-auto min-h-20 py-2.5 leading-relaxed", className)}
        {...props}
      />
    </Field>
  );
});
