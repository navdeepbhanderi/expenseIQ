"use client";

import { useProfile } from "@/components/providers/profile-provider";
import { useMarkRead, useNotificationList } from "@/lib/api/misc";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill, Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";

/** Notifications — the banners design 6e describes, as a list. */
export default function NotificationsPage() {
  const { activeId } = useProfile();
  const { data, isPending } = useNotificationList(activeId);
  const markRead = useMarkRead(activeId);

  const unread = (data ?? []).filter((n) => !n.readAt).length;

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink sm:text-[27px]">
          Notifications
        </h1>
        {unread > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void markRead.mutateAsync("all")}
          >
            Mark all read
          </Button>
        )}
      </div>

      {(data?.length ?? 0) === 0 ? (
        <EmptyState title="Nothing to report">
          Due dates, limit nudges and anything else worth your attention will
          appear here.
        </EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-paper">
          {data!.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                "flex items-start gap-3 border-b border-line-soft px-4 py-3.5 last:border-0",
                // Unread gets a tint rather than bold text: it survives being
                // read at a glance and does not shift the layout when it clears.
                !notification.readAt && "bg-attention-soft/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {notification.title}
                  {!notification.readAt && <Pill tone="attention">New</Pill>}
                </p>
                {notification.body && (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
                    {notification.body}
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-faint">
                  {new Date(notification.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              {!notification.readAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void markRead.mutateAsync(notification.id)}
                >
                  Mark read
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
