"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { AuthShell } from "@/components/auth/auth-shell";
import { api, ApiError } from "@/lib/api/client";

/**
 * Verified - design 7e's success state.
 *
 * Reached two ways: by following the emailed link (which carries `token` and
 * must be consumed here) or by the verify page's poller noticing the address
 * is already verified (no token, nothing to do).
 */
function Verified() {
  const params = useSearchParams();
  const token = params.get("token");

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(!token);

  useEffect(() => {
    if (!token) return;

    void (async () => {
      try {
        await api.post("/auth/verify-email", { token }, { anonymous: true });
        setDone(true);
      } catch (caught) {
        // An already-consumed token is the common case here: the poller often
        // beats the click, or the link gets opened twice.
        setError(
          caught instanceof ApiError
            ? caught.displayMessage
            : "Could not verify that link.",
        );
      }
    })();
  }, [token]);

  if (error && !done) {
    return (
      <AuthShell
        title="That link didn't work"
        subtitle="It may have expired or already been used."
        footer={
          <Link href="/login" className="font-medium text-green hover:underline">
            Go to log in
          </Link>
        }
      >
        <Banner tone="error">{error}</Banner>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Email verified"
      subtitle="You're all set. Let's add your first account."
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-income/30 bg-income/10 px-4 py-3.5">
          <CheckCircle2 className="size-5 shrink-0 text-income" aria-hidden="true" />
          <p className="text-sm text-ink-soft">
            Your address is confirmed. Nothing left to type.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Button asChild className="h-11 w-full">
            <Link href="/accounts">Set up my accounts</Link>
          </Button>
          <Button asChild variant="ghost" className="h-11 w-full">
            <Link href="/dashboard">Skip for now</Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}

export default function VerifiedPage() {
  return (
    <Suspense fallback={null}>
      <Verified />
    </Suspense>
  );
}
