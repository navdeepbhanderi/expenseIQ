"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./hooks";
import type {
  ConfirmResult,
  NluCandidate,
  NluParseResult,
  Transaction,
} from "./types";

export const reviewKeys = {
  queue: (profileId: string) => ["profile", profileId, "review-queue"] as const,
  summary: (profileId: string) =>
    ["profile", profileId, "review-queue", "summary"] as const,
};

export interface ReviewQueueItem extends NluCandidate {
  status: string;
  rawText: string | null;
  createdAt: string;
}

export function useReviewQueue(profileId: string | null) {
  return useQuery({
    queryKey: reviewKeys.queue(profileId ?? ""),
    queryFn: () =>
      api.get<{ items: ReviewQueueItem[] }>(
        `/profiles/${profileId}/review-queue`,
      ),
    enabled: Boolean(profileId),
  });
}

/**
 * Parses text into candidates.
 *
 * Not a query: parsing is an action with a cost and a side effect (it creates
 * an NluRequest and its review items), so it must never be re-run by a cache
 * refetch or a window focus.
 */
export function useParse(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (text: string) =>
      api.post<NluParseResult>(`/profiles/${profileId}/nlu/parse`, { text }),
    onSuccess: () => {
      if (profileId) {
        void client.invalidateQueries({ queryKey: reviewKeys.queue(profileId) });
        void client.invalidateQueries({ queryKey: keys.profiles });
      }
    },
  });
}

export interface ConfirmPayload {
  itemId: string;
  /** Any field the user corrected before confirming. */
  patch?: {
    amountMinor?: number;
    categoryId?: string | null;
    accountId?: string | null;
    date?: string;
    note?: string | null;
    merchant?: string | null;
  };
}

/**
 * Confirms one item into the ledger.
 *
 * Everything downstream is invalidated rather than patched: a confirmation
 * moves an account balance, a budget, a category total and the month's spend
 * at once, and hand-reconciling all of those in the cache is how a UI ends up
 * disagreeing with the database.
 */
export function useConfirm(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, patch }: ConfirmPayload) =>
      api.post<ConfirmResult>(
        `/profiles/${profileId}/review-queue/${itemId}/confirm`,
        patch ?? {},
      ),
    onSuccess: () => invalidateLedger(client, profileId),
  });
}

export function useDiscard(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) =>
      api.post(`/profiles/${profileId}/review-queue/${itemId}/discard`),
    onSuccess: () => invalidateLedger(client, profileId),
  });
}

/** Redeems the 10-second undo token from a confirm. */
export function useUndo(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (token: string) =>
      api.post(`/profiles/${profileId}/review-queue/undo`, { token }),
    onSuccess: () => invalidateLedger(client, profileId),
  });
}

export function useCreateTransaction(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Transaction>(`/profiles/${profileId}/transactions`, body),
    onSuccess: () => invalidateLedger(client, profileId),
  });
}

function invalidateLedger(
  client: ReturnType<typeof useQueryClient>,
  profileId: string | null,
): void {
  if (!profileId) return;

  // One broad invalidation rather than five precise ones. Every key is
  // namespaced under the profile, so this is both correct and cheap.
  void client.invalidateQueries({ queryKey: ["profile", profileId] });
  void client.invalidateQueries({ queryKey: keys.profiles });
}
