"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./client";
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
          // The API's DTO accepts both `?ids=a&ids=b` and `?ids=a,b` - see
          // toStringArray in transaction.dto.ts. Comma is the compact form.
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

/**
 * Writes a transaction the user typed themselves.
 *
 * Straight to the ledger rather than through the review queue: the queue
 * exists to confirm guesses, and there is no guess here. Defaults to source
 * MANUAL on the server, which is what keeps these out of the parser's
 * accuracy statistics.
 */
export function useCreateTransaction(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      amountMinor: number;
      direction: "DEBIT" | "CREDIT";
      date: string;
      categoryId?: string;
      accountId?: string;
      merchant?: string;
      note?: string;
    }) => api.post<Transaction>(`/profiles/${profileId}/transactions`, body),
    onSuccess: () => invalidate(client, profileId),
  });
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

/**
 * Puts a deleted transaction back.
 *
 * Deletion is soft precisely so this can exist, but nothing called it - the
 * only undo was the toast's short-lived token, and once that expired a
 * mis-tapped delete was permanent as far as the user could tell.
 */
export function useRestoreTransaction(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/profiles/${profileId}/transactions/${id}/restore`),
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
/**
 * Downloads the current view as CSV.
 *
 * Goes through the shared client rather than a bare fetch.
 *
 * The hand-rolled version read the access token directly, which skips the
 * single-flight refresh - so an export attempted after the token aged out
 * threw "Export failed" instead of refreshing and retrying like every other
 * call in the app. Since the token is short-lived and an export is exactly the
 * kind of thing done after reading a page for a while, that was easy to hit.
 *
 * It also used `Object.entries(filters)`, which silently dropped any filter
 * whose key the API spells differently and would have carried through
 * unexpected ones; the fields are now named explicitly.
 */
export async function downloadExport(
  profileId: string,
  filters: TransactionFilters,
): Promise<void> {
  const csv = await api.getText(
    `/profiles/${profileId}/transactions/export`,
    {
      query: {
        q: filters.q,
        from: filters.from,
        to: filters.to,
        direction: filters.direction,
        ...arrayParam("categoryIds", filters.categoryIds),
        ...arrayParam("accountIds", filters.accountIds),
      },
    },
  );

  const objectUrl = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `expenseiq-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();

  // Released on a delay - revoking synchronously can cancel the download in
  // some browsers before it has started reading the blob.
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
