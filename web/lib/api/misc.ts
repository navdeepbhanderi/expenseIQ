"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE, getAccessToken } from "./client";
import { keys } from "./hooks";
import type { AppNotification, Money, RecurringRule } from "./types";

/** recurring.service.ts RecurrenceSuggestion. */
export interface RecurrenceSuggestion {
  signature: string;
  merchantId: string | null;
  merchantName: string | null;
  categoryId: string | null;
  accountId: string | null;
  cadence: string;
  typicalAmount: Money;
  amountVariancePercent: number;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  nextExpected?: string;
  confidence?: number;
  /** True once accepted — the suggestion has become a rule. */
  alreadyConfirmed: boolean;
}

export const miscKeys = {
  recurring: (profileId: string) =>
    ["profile", profileId, "recurring"] as const,
  detected: (profileId: string) =>
    ["profile", profileId, "recurring", "detected"] as const,
  notifications: (profileId: string) =>
    ["profile", profileId, "notifications"] as const,
};

export function useRecurringRules(profileId: string | null) {
  return useQuery({
    queryKey: miscKeys.recurring(profileId ?? ""),
    queryFn: () =>
      api.get<RecurringRule[]>(`/profiles/${profileId}/recurring`),
    enabled: Boolean(profileId),
  });
}

export function useDetectedRecurring(profileId: string | null) {
  return useQuery({
    queryKey: miscKeys.detected(profileId ?? ""),
    queryFn: () =>
      api.get<RecurrenceSuggestion[]>(
        `/profiles/${profileId}/recurring/detected`,
      ),
    enabled: Boolean(profileId),
    // Detection scans a year of history; it does not change minute to minute.
    staleTime: 5 * 60_000,
  });
}

export function useCreateRecurring(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/profiles/${profileId}/recurring`, body),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useDeleteRecurring(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: string) =>
      api.delete(`/profiles/${profileId}/recurring/${ruleId}`),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useNotificationList(profileId: string | null) {
  return useQuery({
    queryKey: miscKeys.notifications(profileId ?? ""),
    queryFn: () =>
      api.get<AppNotification[]>(`/profiles/${profileId}/notifications`),
    enabled: Boolean(profileId),
  });
}

export function useMarkRead(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string | "all") =>
      notificationId === "all"
        ? api.post(`/profiles/${profileId}/notifications/read-all`)
        : api.post(
            `/profiles/${profileId}/notifications/${notificationId}/read`,
          ),
    onSuccess: () => invalidate(client, profileId),
  });
}

/**
 * Uploads a receipt.
 *
 * FormData, not JSON — and deliberately not through `api.post`, which sets a
 * JSON content type. The browser must set multipart's boundary itself, so the
 * header is left unset here on purpose.
 */
export async function uploadReceipt(
  profileId: string,
  file: File,
): Promise<{ id: string }> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(
    `${API_BASE}/profiles/${profileId}/receipts`,
    {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
      body,
    },
  );

  if (!response.ok) {
    const envelope = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;

    throw new Error(
      Array.isArray(envelope?.message)
        ? envelope.message.join(". ")
        : (envelope?.message ?? "Upload failed"),
    );
  }

  return (await response.json()) as { id: string };
}

function invalidate(
  client: ReturnType<typeof useQueryClient>,
  profileId: string | null,
): void {
  if (!profileId) return;
  void client.invalidateQueries({ queryKey: ["profile", profileId] });
  void client.invalidateQueries({ queryKey: keys.profiles });
}
