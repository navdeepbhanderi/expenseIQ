"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "expenseiq-theme";

/*
 * The theme's source of truth is the `data-theme` attribute on <html>, which
 * the pre-paint script in components/theme-script.tsx sets before React runs.
 *
 * That makes it genuinely external state, so it is read with
 * useSyncExternalStore rather than mirrored into component state via an
 * effect. Mirroring would render once with a guessed value and then correct
 * itself — the exact flash the pre-paint script exists to prevent — and would
 * drift if anything else ever set the attribute.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Also observe the attribute directly, so a theme change from anywhere —
  // devtools, another hook instance, a future settings screen — is picked up.
  const observer = new MutationObserver(() => {
    for (const l of listeners) l();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  return () => {
    listeners.delete(listener);
    observer.disconnect();
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/**
 * Light on the server.
 *
 * The server cannot know the user's stored preference, and guessing would
 * produce a hydration mismatch. The pre-paint script has already applied the
 * real theme to the DOM by the time this matters, which is why <html> carries
 * suppressHydrationWarning.
 */
function getServerSnapshot(): Theme {
  return "light";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode. The theme still applies for this session; it just
      // won't be remembered, which beats throwing.
    }

    // The MutationObserver in `subscribe` picks the change up and notifies
    // every hook instance, so no manual state update is needed here.
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
