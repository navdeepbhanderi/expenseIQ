"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a session probably exists, for UI that has no auth context.
 *
 * The marketing pages deliberately skip AppProviders so they stay static and
 * do not fire a token refresh for strangers. That left them showing "Log in"
 * to people who are already signed in. This reads a non-httpOnly hint cookie
 * the server sets alongside the real one.
 *
 * It is a hint and nothing more. It carries no identity and grants no access -
 * every authorisation decision still rests on the httpOnly refresh cookie and
 * the access token. The worst a forged value can do is show the wrong button.
 */
const COOKIE = "eiq_session";

function read(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`));
}

let cached: boolean | null = null;

function subscribe(listener: () => void): () => void {
  // Cookies fire no event, so this polls slowly. It only drives which button
  // is shown, and a second of staleness costs nothing.
  const timer = setInterval(() => {
    const next = read();
    if (next !== cached) {
      cached = next;
      listener();
    }
  }, 1000);

  return () => clearInterval(timer);
}

function getSnapshot(): boolean {
  if (cached === null) cached = read();
  return cached;
}

export function useHasSession(): boolean {
  // False on the server: it cannot know, and guessing would mismatch.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
