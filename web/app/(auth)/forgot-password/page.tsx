"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banner } from "@/components/ui/feedback";
import { AuthShell } from "@/components/auth/auth-shell";
import { api, ApiError } from "@/lib/api/client";

/**
 * Forgot password.
 *
 * The success state deliberately does not confirm the address exists - the
 * server answers identically either way, and a UI that said "we found you"
 * would undo that and turn this form into a membership check.
 */
function ForgotPassword() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await api.post("/auth/forgot-password", { email }, { anonymous: true });
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.displayMessage
          : "Could not send the link. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={
          <>
            If <span className="font-medium text-ink">{email}</span> has an
            account with a password, a reset link is on its way. It expires in
            30 minutes.
          </>
        }
        footer={
          <Link href="/login" className="font-medium text-green hover:underline">
            Back to log in
          </Link>
        }
      >
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-field px-4 py-3.5">
          <MailCheck className="size-5 shrink-0 text-green" aria-hidden="true" />
          <p className="text-sm text-ink-soft">
            Nothing after a minute? Check spam, or try again below.
          </p>
        </div>

        <Button
          variant="ghost"
          className="mt-4 h-11 w-full"
          onClick={() => setSent(false)}
        >
          Use a different address
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link. It works once and expires in 30 minutes."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-green hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {error && <Banner tone="error">{error}</Banner>}

        <Input
          label="Email"
          type="email"
          inputMode="email"
          placeholder="aarav@gmail.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Button type="submit" className="h-11 w-full" isLoading={submitting}>
          Send the reset link
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPassword />
    </Suspense>
  );
}
