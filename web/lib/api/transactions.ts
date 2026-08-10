"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, API_BASE, getAccessToken } from "./client";
import { keys } from "./hooks";
import type { Transaction, TransactionList } from "./types";

export interface TransactionFilters {
  q?: string;
  from?: string;
  to?: string;
  categoryIds?: string[];
  accountIds?: string[];
  direction?: "DEBIT" | "CREDIT";
}

export const txKeys = {
  list: (profileId: string, filters: TransactionFilters) =>
    ["profile", profileId, "transactions", filters] as const,
};

/**
 * Cursor-paginated list.
 *
 * Cursor rather than offset because the ledger grows at the top: with
 * offset paging, confirming an expense while page 2 is open shifts every row
 * down one and the reader sees a duplicate. A cursor is anchored to a row, so
 * it stays correct while the list changes underneath.
 */
export function useTransactions(
  profileId: string | null,
  filters: TransactionFilters,
) {
  return useInfiniteQuery({
    queryKey: txKeys.list(profileId ?? "", filters),
    enabled: Boolean(profileId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<TransactionList>(`/profiles/${profileId}/transactions`, {
        query: {
          limit: 25,
          cursor: pageParam,
          q: filters.q,
          from: filters.from,
          to: filters.to,
          direction: filters.direction,
          // The API takes repeated params for arrays; a comma-joined string
          // would arrive as one id and silently match nothing.
          ...arrayParam("categoryIds", filters.categoryIds),
          ...arrayParam("accountIds", filters.accountIds),
        },
      }),
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  });
}

function arrayParam(
  name: string,
  values?: string[],
): Record<string, string> | Record<string, never> {
  if (!values || values.length === 0) return {};
  return { [name]: values.join(",") };
}

export function useUpdateTransaction(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) =>
      api.patch<Transaction>(
        `/profiles/${profileId}/transactions/${id}`,
        patch,
      ),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useDeleteTransaction(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/profiles/${profileId}/transactions/${id}`),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useBulkDelete(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (transactionIds: string[]) =>
      api.post(`/profiles/${profileId}/transactions/bulk-delete`, {
        transactionIds,
      }),
    onSuccess: () => invalidate(client, profileId),
  });
}

/**
 * Downloads the CSV export.
 *
 * Fetched with the auth header rather than opened as a link, because a plain
 * <a href> carries no Authorization and the endpoint would 401. The blob is
 * handed to a temporary anchor so the browser saves it under a real filename.
 */
export async function downloadExport(
  profileId: string,
  filters: TransactionFilters,
): Promise<void> {
  const url = new URL(`${API_BASE}/profiles/${profileId}/transactions/export`);

  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : value);
  }

  const response = await fetch(url, {
    credentials: "include",
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });

  if (!response.ok) throw new Error("Export failed");

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `expenseiq-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();

  // Released on the next tick — revoking synchronously can cancel the
  // download in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function invalidate(
  client: ReturnType<typeof useQueryClient>,
  profileId: string | null,
): void {
  if (!profileId) return;
  void client.invalidateQueries({ queryKey: ["profile", profileId] });
  void client.invalidateQueries({ queryKey: keys.profiles });
}
