"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { keys } from "./hooks";
import type { Money, ProfileKind, ProfileRole, UpcomingDue } from "./types";

/*
 * Every type here is transcribed from the server's own interfaces rather than
 * inferred from a sample response — the reports bug came from shaping types
 * against arrays that happened to be empty.
 */

/** family.service.ts MemberView */
export interface MemberView {
  id: string;
  userId: string;
  role: ProfileRole;
  name: string | null;
  email: string;
  joinedAt: string;
  /** True for the caller, so the UI can render "you". */
  isYou: boolean;
}

/** budgets BudgetStatus, reused by spend limits */
export interface LimitStatus {
  budget: Money;
  spent: Money;
  remaining: Money;
  usedPercent: number;
  /** Past 80% — the nudge threshold, which never blocks. */
  isApproaching: boolean;
  isOver: boolean;
}

export interface SpendLimitLine {
  categoryId: string | null;
  categoryName: string;
  status: LimitStatus;
}

export interface SpendLimitOverview {
  month: string;
  overall: SpendLimitLine | null;
  categories: SpendLimitLine[];
}

export interface AllowanceStatus {
  allowance: {
    id: string;
    amountMinor: number;
    dayOfMonth: number;
    lastCreditedMonth: string | null;
  } | null;
  credited: Money;
  spent: Money;
  remaining: Money;
}

export interface GoalView {
  goal: {
    id: string;
    name: string;
    targetMinor: number;
    targetDate: string | null;
  };
  saved: Money;
  target: Money;
  remaining: Money;
  percentComplete: number;
  isAchieved: boolean;
  /** Null when there is no target date, or the goal is already met. */
  perMonthToHitTarget: Money | null;
  contributions: {
    amountMinor: number;
    byUserId: string;
    note: string | null;
    at?: string;
  }[];
}

export interface FamilyMemberSummary {
  profileId: string;
  name: string;
  initials: string;
  avatarColor: string;
  kind: ProfileKind;
  role: ProfileRole;
  spent: Money;
  income: Money;
  allowanceRemaining: Money | null;
  pendingReviewCount: number;
  /** False when the caller may see totals but not the rows behind them. */
  canSeeDetail: boolean;
}

export interface FamilyDashboard {
  month: string;
  householdSpent: Money;
  householdIncome: Money;
  members: FamilyMemberSummary[];
  upcomingDues: (UpcomingDue & {
    profileId: string;
    profileName: string;
  })[];
}

export const familyKeys = {
  members: (profileId: string) =>
    ["profile", profileId, "members"] as const,
  limits: (profileId: string) => ["profile", profileId, "spend-limits"] as const,
  allowance: (profileId: string) =>
    ["profile", profileId, "allowance"] as const,
  goals: (profileId: string) => ["profile", profileId, "goals"] as const,
  dashboard: ["family", "dashboard"] as const,
};

export function useMembers(profileId: string | null) {
  return useQuery({
    queryKey: familyKeys.members(profileId ?? ""),
    queryFn: () => api.get<MemberView[]>(`/profiles/${profileId}/members`),
    enabled: Boolean(profileId),
  });
}

export function useInviteMember(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: { email: string; role: ProfileRole }) =>
      api.post(`/profiles/${profileId}/members/invite`, body),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useRemoveMember(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/profiles/${profileId}/members/${memberId}`),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useSpendLimits(profileId: string | null) {
  return useQuery({
    queryKey: familyKeys.limits(profileId ?? ""),
    queryFn: () =>
      api.get<SpendLimitOverview>(`/profiles/${profileId}/spend-limits`),
    enabled: Boolean(profileId),
  });
}

export function useAllowance(profileId: string | null) {
  return useQuery({
    queryKey: familyKeys.allowance(profileId ?? ""),
    queryFn: () =>
      api.get<AllowanceStatus>(`/profiles/${profileId}/allowance`),
    enabled: Boolean(profileId),
  });
}

export function useGoals(profileId: string | null) {
  return useQuery({
    queryKey: familyKeys.goals(profileId ?? ""),
    queryFn: () => api.get<GoalView[]>(`/profiles/${profileId}/goals`),
    enabled: Boolean(profileId),
  });
}

export function useCreateGoal(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      name: string;
      targetMinor: number;
      targetDate?: string;
    }) => api.post(`/profiles/${profileId}/goals`, body),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useContribute(profileId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      goalId,
      amountMinor,
    }: {
      goalId: string;
      amountMinor: number;
    }) =>
      api.post(`/profiles/${profileId}/goals/${goalId}/contribute`, {
        amountMinor,
      }),
    onSuccess: () => invalidate(client, profileId),
  });
}

export function useFamilyDashboard(enabled: boolean) {
  return useQuery({
    queryKey: familyKeys.dashboard,
    queryFn: () => api.get<FamilyDashboard>("/family/dashboard"),
    enabled,
  });
}

function invalidate(
  client: ReturnType<typeof useQueryClient>,
  profileId: string | null,
): void {
  if (!profileId) return;
  void client.invalidateQueries({ queryKey: ["profile", profileId] });
  void client.invalidateQueries({ queryKey: familyKeys.dashboard });
  void client.invalidateQueries({ queryKey: keys.profiles });
}
