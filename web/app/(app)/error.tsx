"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

/**
 * Route-level error boundary.
 *
 * Shows a recovery path rather than a stack trace. `reset` re-renders the
 * segment, which is usually enough — most failures here are a request that
 * did not come back rather than a broken component.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-4 sm:p-6">
      <EmptyState
        title="Something went wrong on this screen"
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={reset}>
              Try again
            </Button>
            <Button asChild size="sm" variant="secondary">
              <a href="/dashboard">Back to dashboard</a>
            </Button>
          </div>
        }
      >
        Your data is safe — nothing was changed. {" "}
        {/* The digest is what a support conversation can actually act on. */}
        {error.digest && (
          <span className="font-mono text-xs">Reference {error.digest}</span>
        )}
      </EmptyState>
    </div>
  );
}
