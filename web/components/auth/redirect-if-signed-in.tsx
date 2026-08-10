"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

/**
 * Keeps a signed-in user off the login and signup screens.
 *
 * Waits for `isLoading` to settle first: acting on "no user yet" would bounce
 * every visitor to the dashboard and back while the refresh cookie was still
 * being redeemed. Uses replace so the back button does not return them here.
 */
export function RedirectIfSignedIn() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) router.replace("/dashboard");
  }, [isLoading, user, router]);

  return null;
}
