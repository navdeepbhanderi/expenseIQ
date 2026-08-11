"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { checkPassword, passwordStrength } from "@/lib/password";

/**
 * The strength caption and bar - design 7b's "Strong · 10+ characters with a
 * number".
 *
 * It reports the *server's* rules, not a softer marketing version of them.
 * Telling someone their password is strong and then watching the server reject
 * it teaches them that the app's feedback is decorative, at the exact moment
 * they are deciding whether to trust it with their money.
 */
export function PasswordMeter({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  if (password === "") {
    return (
      <p className={cn("text-xs text-ink-faint", className)}>
        At least 8 characters, with a number and a special character.
      </p>
    );
  }

  const { strength, label } = passwordStrength(password);
  const { failures } = checkPassword(password);

  const bars = strength === "strong" ? 3 : strength === "fair" ? 2 : 1;
  const colour =
    strength === "strong"
      ? "bg-income"
      : strength === "fair"
        ? "bg-attention"
        : "bg-spend";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < bars ? colour : "bg-line-soft",
            )}
          />
        ))}
      </div>

      <p
        className={cn(
          "flex items-center gap-1.5 text-xs",
          strength === "strong" ? "text-income" : "text-ink-muted",
        )}
        // Polite: it changes on every keystroke, and interrupting someone
        // mid-password to read a rule back at them is hostile.
        aria-live="polite"
      >
        {strength === "strong" && (
          <Check className="size-3.5" aria-hidden="true" />
        )}
        {label}
      </p>

      {/*
       * Every unmet rule, not just the first. Someone fixing a password should
       * learn all of what is wrong rather than discovering it one submit at a
       * time.
       */}
      {failures.length > 1 && (
        <ul className="flex flex-col gap-0.5 text-[11px] text-ink-faint">
          {failures.slice(1).map((failure) => (
            <li key={failure}>· {failure}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
