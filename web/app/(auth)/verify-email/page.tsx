"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { AuthShell } from "@/components/auth/auth-shell";
import { api, ApiError } from "@/lib/api/client";

/** The design shows 0:42; the server has no cooldown, so this is ours. */
const RESEND_COOLDOWN_SECONDS = 42;

/** Stop polling after five minutes - see the comment on `enabled` below. */
const POLL_CEILING_MS = 5 * 60_000;

function VerifyEmail() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";

  const [startedAt] = useState(() => Date.now());
  const [expired, setExpired] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendNote, setResendNote] = useState<string | null>(null);

  /*
   * Design 7d: "this page updates on its own".
   *
   * Polling stops after five minutes rather than running forever. A tab left
   * open overnight would otherwise hammer the endpoint all night for a person
   * who is not there, and someone returning after that long will reload
   * anyway. `refetchIntervalInBackground` stays false so a backgrounded tab
   * goes quiet.
   */
  const status = useQuery({
    queryKey: ["verification-status", email],
    queryFn: () =>
      api.get<{ verified: boolean }>("/auth/verification-status", {
        query: { email },
        anonymous: true,
      }),
    enabled: email !== "" && !expired,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  const verified = status.data?.verified ?? false;

  useEffect(() => {
    if (verified) {
      router.replace(`/verified?email=${encodeURIComponent(email)}`);
    }
  }, [verified, email, router]);

  // A single timer drives both the resend cooldown and the polling ceiling,
  // so there is one interval on the page rather than three.
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldown((n) => (n > 0 ? n - 1 : 0));
      if (Date.now() - startedAt > POLL_CEILING_MS) setExpired(true);
    }, 1000);

    return () => clearInterval(timer);
  }, [startedAt]);

  const resend = useCallback(async () => {
    setResendNote(null);

    try {
      await api.post("/auth/resend-verification", { email }, { anonymous: true });
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setResendNote("Sent. Check your inbox again.");
      // Restart polling if it had given up.
      setExpired(false);
    } catch (caught) {
      setResendNote(
        caught instanceof ApiError
          ? caught.displayMessage
          : "Could not resend. Try again shortly.",
      );
    }
  }, [email]);

  return (
    <AuthShell
      title="Check your inbox"
      subtitle={
        <>
          We sent a verification link to{" "}
          <span className="font-medium text-ink">{email || "your email"}</span>.
          Open it on any device and you&rsquo;re in - nothing to type, no code
          to copy.
        </>
      }
      footer={
        <>
          Wrong address?{" "}
          <Link
            href="/signup"
            className="font-medium text-green hover:underline"
          >
            Change your email
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div
          className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-field px-4 py-3.5"
          aria-live="polite"
        >
          {expired ? (
            <>
              <Mail className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="text-sm text-ink-muted">
                Still waiting. Open the link, then use the button below.
              </span>
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="size-2 shrink-0 animate-pulse rounded-full bg-green"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">
                  Waiting for you to confirm…
                </p>
                <p className="text-xs text-ink-faint">
                  This page updates on its own
                </p>
              </div>
            </>
          )}
        </div>

        {resendNote && <Banner tone="info">{resendNote}</Banner>}

        <div className="flex flex-col gap-2.5">
          <Button asChild variant="secondary" className="h-11 w-full">
            <a href="https://mail.google.com" target="_blank" rel="noreferrer">
              Open Gmail
            </a>
          </Button>

          <Button
            variant="ghost"
            className="h-11 w-full"
            onClick={() => void resend()}
            disabled={cooldown > 0}
          >
            {cooldown > 0
              ? `Resend in 0:${String(cooldown).padStart(2, "0")}`
              : "Resend the link"}
          </Button>

          {/*
           * The manual fallback. Polling can be blocked, throttled or simply
           * stopped after the ceiling - a user who has clicked the link must
           * never be stranded on this page.
           */}
          {expired && (
            <Button
              className="h-11 w-full"
              onClick={() => void status.refetch()}
              isLoading={status.isFetching}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              I&rsquo;ve verified - continue
            </Button>
          )}
        </div>

        <p className="text-xs leading-relaxed text-ink-faint">
          Nothing in the inbox after a minute? Check spam - the sender is
          hello@expenseiq.in.
        </p>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams needs a Suspense boundary to keep the route static.
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}
