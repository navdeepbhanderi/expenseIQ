"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./hooks";
import type {
  ConfirmResult,
  NluCandidate,
  NluParseResult,
  ReviewItemRow,
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

/**
 * The queue returns raw rows with `parsed*` names — a different shape from the
 * candidates POST /nlu/parse returns, even though both describe the same
 * thing. Normalising here rather than in the page means one component renders
 * both, and the difference stays at the API boundary where it belongs.
 */
function toCandidate(row: ReviewItemRow): ReviewQueueItem {
  return {
    reviewItemId: row.id,
    amountMinor: row.parsedAmountMinor,
    direction: row.parsedDirection,
    categoryId: row.parsedCategoryId,
    categoryName: null,
    merchant: row.parsedMerchant,
    date: row.parsedDate,
    accountId: row.parsedAccountId,
    accountName: null,
    note: row.parsedNote,
    confidence: row.confidence ?? 0,
    // A row with no band was never parsed by a model — extraction failed and
    // the raw text was kept. It needs a human, which is what NEEDS_FIELD says.
    confidenceBand: row.confidenceBand ?? "NEEDS_FIELD",
    missingFields: row.missingFields,
    uncertainFields: [],
    canOneTapConfirm:
      row.confidenceBand === "CLEAR" && row.missingFields.length === 0,
    suggestedAccounts: [],
    status: row.status,
    rawText: row.nluRequest?.rawInput ?? null,
    createdAt: row.createdAt,
  };
}

export function useReviewQueue(profileId: string | null) {
  return useQuery({
    queryKey: reviewKeys.queue(profileId ?? ""),
    queryFn: async () => {
      const raw = await api.get<{ items: ReviewItemRow[] } | ReviewItemRow[]>(
        `/profiles/${profileId}/review-queue`,
      );

      // The endpoint has returned both a bare array and a wrapper at
      // different times; accepting either keeps this from breaking on a
      // shape the caller cannot control.
      const rows = Array.isArray(raw) ? raw : raw.items;
      return { items: rows.map(toCandidate) };
    },
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
