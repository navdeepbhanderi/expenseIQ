"use client";

import { createContext, useContext, useMemo } from "react";
import { useProfiles } from "@/lib/api/hooks";
import { useStoredValue } from "@/lib/stored-value";
import type { ProfileSummary } from "@/lib/api/types";

const STORAGE_KEY = "expenseiq-profile";

interface ProfileState {
  profiles: ProfileSummary[];
  active: ProfileSummary | null;
  /** Null until profiles have loaded - routes must wait rather than fetch. */
  activeId: string | null;
  isLoading: boolean;
  select: (profileId: string) => void;
}

const ProfileContext = createContext<ProfileState | null>(null);

/**
 * Which profile the app is looking at.
 *
 * The choice is remembered per browser, because someone who lives in the
 * household ledger should not be dropped back into their personal one on every
 * visit. It is validated against the server's list on load: a remembered id
 * for a profile they have since been removed from must not stick, or every
 * request 403s with no way out of it.
 */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: profiles, isPending } = useProfiles();
  const [selectedId, select] = useStoredValue(STORAGE_KEY);

  const active = useMemo(() => {
    if (!profiles || profiles.length === 0) return null;

    return (
      profiles.find((p) => p.id === selectedId) ??
      profiles.find((p) => p.isDefault) ??
      profiles[0]!
    );
  }, [profiles, selectedId]);

  const value = useMemo(
    () => ({
      profiles: profiles ?? [],
      active,
      activeId: active?.id ?? null,
      isLoading: isPending,
      select,
    }),
    [profiles, active, isPending, select],
  );

  return <ProfileContext value={value}>{children}</ProfileContext>;
}

export function useProfile(): ProfileState {
  const context = useContext(ProfileContext);

  if (!context) {
    throw new Error("useProfile must be used inside <ProfileProvider>");
  }

  return context;
}
