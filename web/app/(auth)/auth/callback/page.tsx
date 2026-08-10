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
 * Two things happen here and both matter:
 *
 *   1. The fragment is stripped from history immediately. Left alone, the
 *      token sits in the back button, in a shared screenshot, and in whatever
 *      the browser syncs between devices.
 *   2. The token goes into memory, never localStorage — same rule as the
 *      password flow. The httpOnly refresh cookie the server set alongside it
 *      is what survives a reload.
 */
export default function GoogleCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Everything runs inside the async path, including the failure branch:
    // setting state synchronously in an effect body cascades a second render
    // before the first has painted.
    void (async () => {
      const fragment = window.location.hash.replace(/^#/, "");
      const token = new URLSearchParams(fragment).get("accessToken");

      if (!token) {
        setError("Google didn't return a session. Try signing in again.");
        return;
      }

      setAccessToken(token);

      // Replace, not push: the token must not be reachable by going back.
      window.history.replaceState(null, "", window.location.pathname);

      try {
        // Confirms the token actually works before sending them into the app,
        // so a bad handoff fails here rather than as a blank dashboard.
        await api.get<AuthUser>("/auth/me");
        router.replace("/dashboard");
      } catch {
        setAccessToken(null);
        setError("That sign-in didn't complete. Try again.");
      }
    })();
  }, [router]);

  if (error) {
    return (
      <AuthShell
        title="Sign-in didn't finish"
        footer={
          <Link href="/signup" className="font-medium text-green hover:underline">
            Create an account instead
          </Link>
        }
      >
        <div className="flex flex-col gap-4">
          <Banner tone="error">{error}</Banner>
          <Button asChild className="h-11 w-full">
            <Link href="/login">Back to log in</Link>
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
