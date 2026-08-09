"use client";

import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";

/**
 * Client-side context for authenticated routes.
 *
 * Deliberately not in the root layout: the marketing pages are static and
 * should stay that way. Wrapping every route in a query cache and an auth
 * bootstrap would make the landing page pull a client bundle and fire a
 * refresh request for visitors who have never signed in.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}
