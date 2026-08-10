"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/controls";
import { Banner } from "@/components/ui/feedback";
import {
  AuthShell,
  GoogleButton,
  OrDivider,
} from "@/components/auth/auth-shell";
import { RedirectIfSignedIn } from "@/components/auth/redirect-if-signed-in";
import { PasswordMeter } from "@/components/auth/password-meter";
import { api, ApiError } from "@/lib/api/client";
import { checkPassword } from "@/lib/password";
import { cn } from "@/lib/cn";

/**
 * Sign up — design 7b (web) and 7f (mobile).
 *
 * 7f drops the name field on mobile. Rather than render two forms, the field
 * is optional in both: the API already treats displayName as optional, and a
 * name asked for on a phone is a name typed badly or not at all. It stays on
 * wider screens where it costs nothing.
 */
export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const passwordCheck = checkPassword(password);
  const canSubmit = email.trim() !== "" && passwordCheck.valid && agreed;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setError(null);

    if (!canSubmit) return;

    setSubmitting(true);

    try {
      await api.post(
        "/auth/signup",
        {
          email,
          password,
          ...(name.trim() ? { displayName: name.trim() } : {}),
        },
        { anonymous: true },
      );

      // 202, not a session: the account exists but is unverified, so the next
      // stop is the inbox rather than the dashboard.
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.displayMessage
          : "Could not create your account. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <RedirectIfSignedIn />
      <AuthShell
        title="Start your ledger"
        subtitle="Free for personal use. No card, no bank login."
        footer={
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-green hover:underline"
            >
              Log in
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error && <Banner tone="error">{error}</Banner>}

          <Input
            label="Your name"
            placeholder="Aarav Sharma"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            // Optional, and the label says so rather than a lone asterisk
            // elsewhere meaning "everything else is required".
            hint="Optional — used to greet you"
            className="hidden sm:block"
          />

          <Input
            label="Email"
            type="email"
            inputMode="email"
            placeholder="aarav@gmail.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={
              attempted && email.trim() === "" ? "Enter your email" : undefined
            }
          />

          <div>
            <PasswordInput
              placeholder="••••••••••"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordMeter password={password} className="mt-2.5" />
          </div>

          <Checkbox
            checked={agreed}
            onCheckedChange={setAgreed}
            className={cn(
              "items-start",
              attempted && !agreed && "[&_label]:text-spend",
            )}
            label={
              <span className="text-[13px] leading-relaxed">
                I agree to the{" "}
                <Link href="/terms" className="text-green hover:underline">
                  terms
                </Link>{" "}
                and privacy policy. ExpenseIQ never asks for net-banking
                credentials.
              </span>
            }
          />

          <Button
            type="submit"
            className="mt-1 h-11 w-full"
            isLoading={submitting}
            disabled={attempted && !canSubmit}
          >
            Create account
          </Button>
        </form>

        <OrDivider />
        <GoogleButton label="Continue with Google" />
      </AuthShell>
    </>
  );
}
