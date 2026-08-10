"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AppNotification,
  Category,
  DashboardSummary,
  ProfileSummary,
} from "./types";

/**
 * Query keys, centralised.
 *
 * Every key starts with the profile id where the data is profile-scoped, so
 * switching profiles invalidates the whole subtree by construction rather than
 * by remembering to invalidate each query. Getting this wrong shows one
 * family's spending under another's name, which is the worst bug this app
 * could have.
 */
export const keys = {
  profiles: ["profiles"] as const,
  dashboard: (profileId: string) => ["profile", profileId, "dashboard"] as const,
  categories: (profileId: string) =>
    ["profile", profileId, "categories"] as const,
  notifications: (profileId: string) =>
    ["profile", profileId, "notifications"] as const,
  unreadCount: (profileId: string) =>
    ["profile", profileId, "notifications", "unread"] as const,
};

export function useProfiles(
  options?: Partial<UseQueryOptions<ProfileSummary[]>>,
) {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: () => api.get<ProfileSummary[]>("/profiles"),
    ...options,
  });
}

export function useDashboard(profileId: string | null) {
  return useQuery({
    queryKey: keys.dashboard(profileId ?? ""),
    queryFn: () =>
      api.get<DashboardSummary>(`/profiles/${profileId}/dashboard`),
    enabled: Boolean(profileId),
  });
}

export function useCategories(profileId: string | null) {
  return useQuery({
    queryKey: keys.categories(profileId ?? ""),
    queryFn: () => api.get<Category[]>(`/profiles/${profileId}/categories`),
    enabled: Boolean(profileId),
    // Categories change when the user edits them, which is rare and always
    // through a mutation that can invalidate this.
    staleTime: 5 * 60_000,
  });
}

export function useUnreadCount(profileId: string | null) {
  return useQuery({
    queryKey: keys.unreadCount(profileId ?? ""),
    queryFn: () =>
      api.get<{ count: number }>(
        `/profiles/${profileId}/notifications/unread-count`,
      ),
    enabled: Boolean(profileId),
  });
}

export function useNotifications(profileId: string | null) {
  return useQuery({
    queryKey: keys.notifications(profileId ?? ""),
    queryFn: () =>
      api.get<AppNotification[]>(`/profiles/${profileId}/notifications`),
    enabled: Boolean(profileId),
  });
}
