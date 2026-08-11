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

/** Accepts a pattern the detector found. Takes only its signature. */
export function useConfirmRecurring(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: { signature: string; autoDebit?: boolean }) =>
      api.post(`/profiles/${profileId}/recurring`, body),
    onSuccess: () => invalidate(client, profileId),
  });
}

/**
 * Creates a schedule the user already knows — a salary on the 1st, rent on
 * the 5th. Detection needs three occurrences, so without this a monthly
 * income would take a quarter to appear, if it ever did.
 */
export function useCreateRecurring(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      amountMinor: number;
      cadence: string;
      dayOfMonth?: number;
      onMonthEnd?: boolean;
      dayOfWeek?: number;
      monthOfYear?: number;
      endsOn?: string | null;
      maxOccurrences?: number | null;
      label?: string;
      direction?: "DEBIT" | "CREDIT";
      accountId?: string;
      categoryId?: string;
      autoDebit?: boolean;
    }) => api.post(`/profiles/${profileId}/recurring/manual`, body),
    onSuccess: () => invalidate(client, profileId),
  });
}

/** Stages any rules that have come due into the review queue. */
export function useGenerateDue(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<{ generated: number; skipped: number }>(
        `/profiles/${profileId}/recurring/generate-due`,
      ),
    onSuccess: () => invalidate(client, profileId),
  });
}

/** Edits a rule — a salary that changed, a schedule that moved. */
export function useUpdateRecurring(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      ruleId,
      patch,
    }: {
      ruleId: string;
      patch: {
        label?: string;
        amountMinor?: number;
        cadence?: string;
        dayOfMonth?: number;
        onMonthEnd?: boolean;
        dayOfWeek?: number;
        monthOfYear?: number;
        endsOn?: string | null;
        maxOccurrences?: number | null;
        autoDebit?: boolean;
        enabled?: boolean;
      };
    }) => api.patch(`/profiles/${profileId}/recurring/${ruleId}`, patch),
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
