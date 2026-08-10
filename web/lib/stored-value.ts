"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A value persisted in localStorage, read the way React wants external state
 * read.
 *
 * Mirroring storage into component state via an effect renders once with a
 * guess and then corrects itself, which flashes the wrong profile (or theme,
 * or anything else) on every load. useSyncExternalStore is the supported
 * answer: the server snapshot is null, so the first paint shows the neutral
 * default and hydration switches to the stored value without a mismatch.
 *
 * Also keeps tabs in step — a profile switched in one tab moves in the other,
 * which matters because the alternative is two tabs quietly writing to
 * different ledgers.
 */

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, string | null>();

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode. Callers fall back to their default.
    return null;
  }
}

export function useStoredValue(
  key: string,
): [string | null, (value: string) => void] {
  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);

      // `storage` fires only in *other* tabs, which is exactly the case the
      // in-process listener set cannot cover.
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) {
          cache.set(key, read(key));
          notify(key);
        }
      };
      window.addEventListener("storage", onStorage);

      return () => {
        set.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );

  // Must return a stable reference between calls or React loops, hence cache.
  const getSnapshot = useCallback(() => {
    if (!cache.has(key)) cache.set(key, read(key));
    return cache.get(key) ?? null;
  }, [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const set = useCallback(
    (next: string) => {
      cache.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Not remembering the choice is survivable; failing to apply it here
        // and now is not, so the cache is updated either way.
      }
      notify(key);
    },
    [key],
  );

  return [value, set];
}
