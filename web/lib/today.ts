"use client";

import { useSyncExternalStore } from "react";

/**
 * Today's calendar date, as YYYY-MM-DD in the user's local zone.
 *
 * Reading `new Date()` during render is impure and, worse, a hydration hazard:
 * the server renders one day and a client loading either side of midnight —
 * or in another timezone — renders a different one, so a chip labelled "Today"
 * would be wrong and React would complain about the mismatch.
 *
 * useSyncExternalStore is the supported answer. The server snapshot is null,
 * so anything date-relative renders as an absolute date until hydration, then
 * switches to "Today"/"Yesterday" without a mismatch warning.
 */

export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let cached: string | null = null;
const listeners = new Set<() => void>();

function refresh(): boolean {
  const next = toLocalISODate(new Date());
  if (next === cached) return false;
  cached = next;
  return true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // A tab left open across midnight should stop calling yesterday "Today".
  // A minute's granularity is plenty for a date label.
  const timer = setInterval(() => {
    if (refresh()) for (const l of listeners) l();
  }, 60_000);

  return () => {
    listeners.delete(listener);
    clearInterval(timer);
  };
}

/**
 * Must return a stable reference between calls or React loops, hence the
 * cache rather than computing fresh each time.
 */
function getSnapshot(): string {
  if (cached === null) refresh();
  return cached!;
}

function getServerSnapshot(): null {
  return null;
}

export function useToday(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
