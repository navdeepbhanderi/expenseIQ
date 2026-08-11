"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./hooks";
import type {
  Account,
  AccountDetail,
  PrepaySimulation,
} from "./types";

export const accountKeys = {
  list: (profileId: string) => ["profile", profileId, "accounts"] as const,
  detail: (profileId: string, accountId: string) =>
    ["profile", profileId, "accounts", accountId] as const,
};

export function useAccounts(profileId: string | null) {
  return useQuery({
    queryKey: accountKeys.list(profileId ?? ""),
    queryFn: () => api.get<Account[]>(`/profiles/${profileId}/accounts`),
    enabled: Boolean(profileId),
  });
}

/**
 * One account with its computed position.
 *
 * The card cycle and loan amortisation come from the server, not from
 * arithmetic here - statement dates that clamp correctly in February and an
 * EMI schedule that settles to the last paisa are exactly the things a client
 * reimplementation gets subtly wrong.
 */
export function useAccount(profileId: string | null, accountId: string) {
  return useQuery({
    queryKey: accountKeys.detail(profileId ?? "", accountId),
    queryFn: () =>
      api.get<AccountDetail>(`/profiles/${profileId}/accounts/${accountId}`),
    enabled: Boolean(profileId && accountId),
  });
}

export function useCreateAccount(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Account>(`/profiles/${profileId}/accounts`, body),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useUpdateAccount(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch<Account>(`/profiles/${profileId}/accounts/${id}`, patch),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useDeleteAccount(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/profiles/${profileId}/accounts/${id}`),
    onSuccess: () => invalidate(client, profileId),
  });
}

/** Design 2d's "prepaying ₹5,00,000 saves ₹3.9L". */
export function usePrepaySimulation(profileId: string | null, accountId: string) {
  return useMutation({
    mutationFn: (amountMinor: number) =>
      api.post<PrepaySimulation>(
        `/profiles/${profileId}/accounts/${accountId}/prepay-simulation`,
        { amountMinor },
      ),
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

/**
 * Pays a card bill or a loan EMI from another account.
 *
 * Writes a transfer pair server-side and moves both balances. Neither entry
 * counts as spending — the expense was recorded when the card was swiped, so
 * counting the payment too would double it and inflate every budget and norm
 * derived from the month.
 */
export function usePayAccount(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      accountId,
      ...body
    }: {
      accountId: string;
      fromAccountId: string;
      amountMinor: number;
      date?: string;
    }) =>
      api.post<{ transferGroupId: string }>(
        `/profiles/${profileId}/accounts/${accountId}/pay`,
        body,
      ),
    // A payment moves two balances, the month's totals and the due tiles at
    // once; reconciling all of that by hand is how a cache starts lying.
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["profile", profileId] });
    },
  });
}
