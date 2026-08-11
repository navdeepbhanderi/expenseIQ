"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./hooks";
import type { Category, Merchant, ProfileKind } from "./types";

/*
 * Shapes transcribed from the server's own interfaces, not inferred from a
 * sample response — sampling an endpoint while its collections are empty
 * proves nothing about the collections.
 */

/** reminders/dto SetReminderDto + the Reminder model. */
export interface Reminder {
  id: string;
  accountId: string;
  /** Days before the due date. Design 6h: "3 days ahead". */
  offsetDays: number;
  /** Minutes past LOCAL midnight. 540 is 9am. */
  timeOfDay: number;
  channels: ("EMAIL" | "PUSH" | "IN_APP")[];
  enabled: boolean;
  lastFiredCycle: string | null;
}

export interface DeleteImpact {
  profileId: string;
  name: string;
  accounts: number;
  transactions: number;
  reviewItems: number;
  /** False when this is the user's last profile — the spec forbids that. */
  deletable: boolean;
  reason?: string;
}

export interface NluAccuracy {
  windowDays: number;
  total: number;
  correctFirstTime: number;
  /** Null until there is anything to measure. */
  accuracyPercent: number | null;
  mostCorrectedField: string | null;
}

export const settingsKeys = {
  reminder: (profileId: string, accountId: string) =>
    ["profile", profileId, "accounts", accountId, "reminder"] as const,
  deleteImpact: (profileId: string) =>
    ["profile", profileId, "delete-impact"] as const,
  accuracy: (profileId: string) => ["profile", profileId, "accuracy"] as const,
  merchants: (profileId: string, q: string) =>
    ["profile", profileId, "merchants", q] as const,
  categoryUsage: (profileId: string, categoryId: string) =>
    ["profile", profileId, "categories", categoryId, "usage"] as const,
};

/* ---------------------------------------------------------- reminders */

/**
 * The account's reminder, or null when it has none.
 *
 * The endpoint returns an *array* — an account could in principle carry more
 * than one reminder — while the UI offers a single one. Unwrapping here rather
 * than at the call site is what keeps `reminder.enabled` from silently reading
 * a property that does not exist on an array, which is exactly what made the
 * toggle impossible to switch on: the PUT succeeded every time and the value
 * the switch rendered from was always undefined.
 */
export function useReminder(profileId: string | null, accountId: string) {
  return useQuery({
    queryKey: settingsKeys.reminder(profileId ?? "", accountId),
    queryFn: async () => {
      const rows = await api.get<Reminder[]>(
        `/profiles/${profileId}/accounts/${accountId}/reminders`,
      );
      return rows[0] ?? null;
    },
    enabled: Boolean(profileId && accountId),
  });
}

export function useSetReminder(profileId: string | null, accountId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      offsetDays?: number;
      timeOfDay?: number;
      channels?: string[];
      enabled?: boolean;
    }) =>
      api.put<Reminder>(
        `/profiles/${profileId}/accounts/${accountId}/reminders`,
        body,
      ),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useDeleteReminder(profileId: string | null, accountId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.delete(`/profiles/${profileId}/accounts/${accountId}/reminders`),
    onSuccess: () => invalidate(client, profileId),
  });
}

/* --------------------------------------------------------- categories */

export function useCreateCategory(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      name: string;
      monogram?: string;
      tint?: string;
      isIncome?: boolean;
    }) => api.post<Category>(`/profiles/${profileId}/categories`, body),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useUpdateCategory(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; monogram?: string; tint?: string };
    }) =>
      api.patch<Category>(`/profiles/${profileId}/categories/${id}`, patch),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useDeleteCategory(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/profiles/${profileId}/categories/${id}`),
    onSuccess: () => invalidate(client, profileId),
  });
}

/** How many transactions a category holds — shown before deleting it. */
export function useCategoryUsage(
  profileId: string | null,
  categoryId: string | null,
) {
  return useQuery({
    queryKey: settingsKeys.categoryUsage(profileId ?? "", categoryId ?? ""),
    queryFn: () =>
      api.get<number>(
        `/profiles/${profileId}/categories/${categoryId}/usage`,
      ),
    enabled: Boolean(profileId && categoryId),
  });
}

/* ----------------------------------------------------------- profiles */

export function useCreateProfile() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      name: string;
      kind?: ProfileKind;
      avatarColor?: string;
    }) => api.post("/profiles", body),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.profiles }),
  });
}

export function useDeleteImpact(profileId: string | null) {
  return useQuery({
    queryKey: settingsKeys.deleteImpact(profileId ?? ""),
    queryFn: () =>
      api.get<DeleteImpact>(`/profiles/${profileId}/delete-impact`),
    enabled: Boolean(profileId),
  });
}

export function useDeleteProfile() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (profileId: string) => api.delete(`/profiles/${profileId}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.profiles }),
  });
}

/* ------------------------------------------------------------ the rest */

/** Design 2b's "21 of 23 entries read correctly on the first try". */
export function useNluAccuracy(profileId: string | null) {
  return useQuery({
    queryKey: settingsKeys.accuracy(profileId ?? ""),
    queryFn: () => api.get<NluAccuracy>(`/profiles/${profileId}/nlu/accuracy`),
    enabled: Boolean(profileId),
  });
}

/** Merchant autocomplete — design 6b's "Not a known merchant — add it?". */
export function useMerchants(profileId: string | null, q: string) {
  return useQuery({
    queryKey: settingsKeys.merchants(profileId ?? "", q),
    queryFn: () =>
      api.get<Merchant[]>(`/profiles/${profileId}/merchants`, { query: { q } }),
    // Below two characters every merchant matches, which is not a suggestion.
    enabled: Boolean(profileId) && q.trim().length >= 2,
  });
}

export function useCreditAllowanceDue(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post(`/profiles/${profileId}/allowance/credit-due`),
    onSuccess: () => invalidate(client, profileId),
  });
}

function invalidate(
  client: ReturnType<typeof useQueryClient>,
  profileId: string | null,
): void {
  if (!profileId) return;
  void client.invalidateQueries({ queryKey: ["profile", profileId] });
  void client.invalidateQueries({ queryKey: keys.profiles });
}

/* ---------------------------------------------------------------- profile */

/**
 * Renames or restyles a profile.
 *
 * The switcher shows a name and an avatar colour that were fixed at creation
 * and could not be changed afterwards — so a household created as "Personal"
 * stayed "Personal" forever.
 */
export function useUpdateProfile(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (patch: {
      name?: string;
      locale?: string;
      currency?: string;
      avatarColor?: string;
    }) => api.patch(`/profiles/${profileId}`, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["profile", profileId] });
      void client.invalidateQueries({ queryKey: keys.profiles });
    },
  });
}
