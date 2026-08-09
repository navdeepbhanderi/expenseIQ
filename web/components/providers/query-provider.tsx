"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api/client";

/**
 * Created inside a `useState` initialiser, not at module scope.
 *
 * A module-level client is shared across every request on the server, which
 * leaks one user's cached data into another's render. Per-component state
 * gives each browser session its own cache and each SSR pass a fresh one.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Money changes when the user changes it, not on a timer. A short
            // stale window stops a tab-switch from refetching the whole
            // dashboard while still catching edits made in another tab.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Retrying a 4xx just repeats the same rejection: the request
              // was wrong, not unlucky. 401 in particular is already handled
              // by the client's refresh path.
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            // Never automatic. A retried POST /transactions is a duplicate
            // expense in someone's ledger.
            retry: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
