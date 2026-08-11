"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError } from "@/lib/api/client";

/**
 * Log in - design 7c, including its error state.
 *
 * Two things the design shows that need care:
 *
 *   - "3 entries are waiting in your review queue" cannot be rendered. It
 *     needs the user's data before they authenticate, and any endpoint that
 *     served it would leak account contents to anyone who knew an address.
 *     It stays a static line.
 *   - "3 tries left" is counted here, in this tab. The server throttles at 10
 *     requests a minute but does not report attempts remaining, so this is
 *     the client being honest about what it knows: a nudge, not a lockout
 *     the server will not enforce.
 */
const NUDGE_AFTER = 2;
const CLIENT_ATTEMPT_BUDGET = 5;

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const triesLeft = Math.max(0, CLIENT_ATTEMPT_BUDGET - failures);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (caught) {
      if (caught instanceof ApiError) {
        /*
         * 403 means "verify your email first", not "wrong password". Showing
         * a credentials error here would send someone to reset a password
         * that was never wrong.
         */
        if (caught.status === 403) {
          router.push(`/verify-email?email=${encodeURIComponent(email)}`);
          return;
        }

        if (caught.status === 429) {
          setError("Too many attempts. Wait a minute and try again.");
        } else {
          setFailures((n) => n + 1);
          setError(caught.displayMessage);
        }
      } else {
        setError("Could not sign you in. Check your connection and retry.");
      }

      setSubmitting(false);
    }
  }

  return (
    <>
      <RedirectIfSignedIn />
      <AuthShell
        title="Welcome back"
        subtitle="Pick up where your ledger left off."
        footer={
          <>
            New here?{" "}
            <Link
              href="/signup"
              className="font-medium text-green hover:underline"
            >
              Create an account
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error && (
            <Banner tone="error">
              {error}
              {failures >= NUDGE_AFTER && triesLeft > 0 && (
                <>
                  {" "}
                  <Link
                    href={`/forgot-password?email=${encodeURIComponent(email)}`}
                    className="font-medium underline"
                  >
                    Reset your password?
                  </Link>
                </>
              )}
            </Banner>
          )}

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

          <div>
            <PasswordInput
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="mt-1.5 text-right">
              <Link
                href={`/forgot-password?email=${encodeURIComponent(email)}`}
                className="text-[13px] text-green hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <Checkbox
            checked={remember}
            onCheckedChange={setRemember}
            label={
              <span className="text-[13px]">
                Keep me signed in on this device
              </span>
            }
          />

          <Button
            type="submit"
            className="mt-1 h-11 w-full"
            isLoading={submitting}
          >
            Log in
          </Button>
        </form>

        <OrDivider />
        <GoogleButton label="Continue with Google" />
      </AuthShell>
    </>
  );
}

export default function LoginPage() {
  /*
   * useSearchParams opts the route into client rendering, and without a
   * Suspense boundary the static prerender throws. Dev never shows this -
   * only `next build` does, which is why every route here that reads params
   * carries one.
   */
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}
