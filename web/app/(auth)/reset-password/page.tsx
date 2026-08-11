"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/input";
import { Banner } from "@/components/ui/feedback";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordMeter } from "@/components/auth/password-meter";
import { api, ApiError } from "@/lib/api/client";
import { checkPassword } from "@/lib/password";

/**
 * Set a new password - design 7e.
 *
 * The server revokes every session on success, so after this the user is
 * signed out everywhere including here. Sending them to login rather than the
 * dashboard is therefore the honest destination, and the copy says so.
 */
function ResetPassword() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const valid = checkPassword(password).valid;
  const matches = password === confirm;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setError(null);

    if (!valid || !matches) return;

    setSubmitting(true);

    try {
      await api.post(
        "/auth/reset-password",
        { token, password },
        { anonymous: true },
      );
      router.push("/login?reset=1");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.displayMessage
          : "Could not update your password. Request a new link.",
      );
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="No reset link"
        subtitle="Open the link from your email, or request a new one."
        footer={
          <Link
            href="/forgot-password"
            className="font-medium text-green hover:underline"
          >
            Request a reset link
          </Link>
        }
      >
        <Banner tone="warning">
          This page needs the token from your reset email.
        </Banner>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="This link works once and expires 30 minutes after it was sent."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {error && <Banner tone="error">{error}</Banner>}

        <div>
          <PasswordInput
            label="New password"
            placeholder="•••••••••"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordMeter password={password} className="mt-2.5" />
        </div>

        <PasswordInput
          label="Confirm password"
          placeholder="•••••••••"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={
            attempted && !matches ? "Both passwords must match" : undefined
          }
        />

        <Button type="submit" className="mt-1 h-11 w-full" isLoading={submitting}>
          Save and log in
        </Button>

        <p className="text-xs leading-relaxed text-ink-faint">
          Saving this signs you out on every other device - if someone else
          knew the old password, they lose access too.
        </p>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}
