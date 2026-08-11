"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/controls";
import { Eyebrow } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import {
  useDeleteReminder,
  useReminder,
  useSetReminder,
} from "@/lib/api/settings";
import { ApiError } from "@/lib/api/client";

/**
 * Due-date reminders — design 6h's "Remind me before due date · 3 days
 * ahead, 9 am".
 *
 * `timeOfDay` is minutes past *local* midnight, and the server interprets it
 * in the profile's timezone. 9 am UTC would arrive at 2:30 pm in India, which
 * is why this offers times rather than a raw number.
 */

const OFFSETS = [
  { value: "0", label: "On the day" },
  { value: "1", label: "1 day before" },
  { value: "2", label: "2 days before" },
  { value: "3", label: "3 days before" },
  { value: "5", label: "5 days before" },
  { value: "7", label: "A week before" },
];

/** Minutes past midnight, as times people actually pick. */
const TIMES = [
  { value: "480", label: "8:00 am" },
  { value: "540", label: "9:00 am" },
  { value: "600", label: "10:00 am" },
  { value: "720", label: "12:00 pm" },
  { value: "1080", label: "6:00 pm" },
  { value: "1200", label: "8:00 pm" },
];

export function ReminderSettings({ accountId }: { accountId: string }) {
  const { activeId } = useProfile();
  const { data: reminder, isPending } = useReminder(activeId, accountId);
  const save = useSetReminder(activeId, accountId);
  const remove = useDeleteReminder(activeId, accountId);
  const { toast } = useToast();

  const [offsetDays, setOffsetDays] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);

  if (isPending) return null;

  // Local state wins while editing; otherwise the saved values show.
  const offset = offsetDays ?? String(reminder?.offsetDays ?? 3);
  const time = timeOfDay ?? String(reminder?.timeOfDay ?? 540);
  const enabled = reminder?.enabled ?? false;

  const persist = (patch: Record<string, unknown>) => {
    void save
      .mutateAsync(patch)
      .then(() => toast({ title: "Reminder updated", tone: "success" }))
      .catch((error: unknown) =>
        toast({
          title: "Couldn't save that reminder",
          description:
            error instanceof ApiError ? error.displayMessage : undefined,
          tone: "error",
        }),
      );
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Reminder</Eyebrow>
          <p className="mt-1 text-[13px] text-ink-muted">
            A nudge before the due date, in the app and by email.
          </p>
        </div>

        <Toggle
          checked={enabled}
          onCheckedChange={(next) => {
            if (next) {
              persist({
                offsetDays: Number(offset),
                timeOfDay: Number(time),
                enabled: true,
              });
            } else {
              // Disabled rather than deleted — turning it back on should
              // restore the schedule the user already chose.
              persist({ enabled: false });
            }
          }}
        />
      </div>

      {enabled && (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select
              label="How far ahead"
              value={offset}
              onValueChange={(value) => {
                setOffsetDays(value);
                persist({ offsetDays: Number(value) });
              }}
              options={OFFSETS}
            />
            <Select
              label="What time"
              value={time}
              onValueChange={(value) => {
                setTimeOfDay(value);
                persist({ timeOfDay: Number(value) });
              }}
              options={TIMES}
            />
          </div>

          <p className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
            <Bell className="size-3.5" aria-hidden="true" />
            Sent once per billing cycle — a second run the same day sends
            nothing.
          </p>

          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-spend hover:bg-spend/10"
            isLoading={remove.isPending}
            onClick={() => {
              void remove
                .mutateAsync()
                .then(() =>
                  toast({ title: "Reminder removed", tone: "info" }),
                );
            }}
          >
            Remove reminder
          </Button>
        </>
      )}
    </section>
  );
}
