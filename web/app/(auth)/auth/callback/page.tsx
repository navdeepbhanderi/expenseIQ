"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/brand/logo";
import { api, setAccessToken } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";

/**
 * Where Google sends the user back — `/auth/callback#accessToken=…`.
 *
 * The token arrives in the URL *fragment* rather than the query string, which
 * is the right call by the server: fragments are never transmitted to any
 * server, so the token stays out of access logs, proxy logs and the Referer
 * header of whatever loads next. It does mean only the browser can read it,
 * which is why this page exists at all.
 *
 * Failures arrive the same way, as `#error=<code>`. The server sends a code
 * rather than a sentence so the copy lives here and so the UI can route on it
 * — an unverified account belongs on the verify screen, not on a dead end.
 */

interface Failure {
  title: string;
  body: string;
  action: { href: string; label: string };
}

function describe(code: string | null, email: string): Failure {
  switch (code) {
    case "unverified":
      return {
        title: "Verify your email first",
        body: "You already have an account with this address, created with a password. Confirm the email we sent, then Google will link to it automatically.",
        action: {
          href: `/verify-email?email=${encodeURIComponent(email)}`,
          label: "Go to verification",
        },
      };
    case "failed":
      return {
        title: "Google sign-in didn't finish",
        body: "Google returned, but we couldn't complete the sign-in. Nothing was changed on your account.",
        action: { href: "/login", label: "Back to log in" },
      };
    default:
      return {
        title: "Sign-in didn't finish",
        body: "Google didn't return a session. Try signing in again.",
        action: { href: "/login", label: "Back to log in" },
      };
  }
}

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    // Everything runs inside the async path, including the failure branch:
    // setting state synchronously in an effect body cascades a second render
    // before the first has painted.
    void (async () => {
      const fragment = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );

      const errorCode = fragment.get("error");
      const email = fragment.get("email") ?? "";
      const token = fragment.get("accessToken");

      // Clear the fragment before anything else. It holds either a live token
      // or the user's email, and left alone both sit in the back button, in a
      // shared screenshot, and in whatever the browser syncs across devices.
      window.history.replaceState(null, "", window.location.pathname);

      if (errorCode || !token) {
        setFailure(describe(errorCode, email));
        return;
      }

      setAccessToken(token);

      try {
        // Confirms the token actually works before sending them into the app,
        // so a bad handoff fails here rather than as a blank dashboard.
        await api.get<AuthUser>("/auth/me");
        router.replace("/dashboard");
      } catch {
        setAccessToken(null);
        setFailure(describe("failed", email));
      }
    })();
  }, [router]);

  if (failure) {
    return (
      <AuthShell
        title={failure.title}
        footer={
          <Link
            href="/signup"
            className="font-medium text-green hover:underline"
          >
            Create a new account instead
          </Link>
        }
      >
        <div className="flex flex-col gap-4">
          <Banner tone="warning">{failure.body}</Banner>
          <Button asChild className="h-11 w-full">
            <Link href={failure.action.href}>{failure.action.label}</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper-sunken">
      <div className="flex flex-col items-center gap-4">
        <Logo size={34} />
        <p className="text-sm text-ink-muted">Finishing your sign-in…</p>
      </div>
    </main>
  );
}
