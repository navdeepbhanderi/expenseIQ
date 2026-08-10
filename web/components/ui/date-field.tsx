"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { toLocalISODate, useToday } from "@/lib/today";
import { Chip } from "./controls";

export { toLocalISODate };

/**
 * Date field with quick chips and a calendar popover — design 6d.
 *
 * The quick chips matter more than the calendar. Almost every expense is
 * logged today or yesterday, and making that one tap instead of a calendar
 * hunt is the difference between logging an expense and not bothering.
 *
 * Dates are handled as local calendar days, never as instants. A transaction
 * on the 5th is on the 5th regardless of the user's timezone, which is why
 * lib/today.ts formats from local parts rather than toISOString() — the latter
 * shifts the day backwards for anyone east of UTC after 5:30am.
 */

function fromISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1);
}

/** Pure: `today` is passed in, so this renders identically on both sides. */
function humanise(iso: string, today: string | null): string {
  if (today) {
    const yesterday = toLocalISODate(
      new Date(fromISODate(today).getTime() - 86_400_000),
    );
    if (iso === today) return "Today";
    if (iso === yesterday) return "Yesterday";
  }

  return fromISODate(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DateField({
  value,
  onChange,
  label,
  className,
  mobile,
}: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  className?: string;
  mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const today = useToday();

  // Almost every expense is logged today or yesterday, so these three chips
  // carry most of the traffic and the calendar is the exception path.
  const quick = useMemo(() => {
    if (!today) return [];
    const base = fromISODate(today).getTime();
    return [
      { label: "Today", iso: today },
      { label: "Yesterday", iso: toLocalISODate(new Date(base - 86_400_000)) },
      {
        label: "2 days ago",
        iso: toLocalISODate(new Date(base - 2 * 86_400_000)),
      },
    ];
  }, [today]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      )}

      <RadixPopover.Root open={open} onOpenChange={setOpen}>
        <RadixPopover.Trigger
          className={cn(
            "flex w-full items-center gap-2.5 rounded-[--radius-control] border border-line bg-field px-[13px] text-left text-sm text-ink",
            "transition-colors hover:border-line-strong",
            mobile ? "h-[52px] rounded-[14px] text-base" : "h-10",
          )}
        >
          <CalendarDays className="size-4 text-ink-muted" aria-hidden="true" />
          {humanise(value, today)}
        </RadixPopover.Trigger>

        <RadixPopover.Portal>
          <RadixPopover.Content
            sideOffset={6}
            align="start"
            className="z-50 rounded-[14px] border border-line bg-paper p-3.5 shadow-[var(--shadow-popover)]"
          >
            <Calendar
              value={value}
              onChange={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>

      <div className="flex flex-wrap gap-2">
        {quick.map((option) => (
          <Chip
            key={option.iso}
            selected={value === option.iso}
            onClick={() => onChange(option.iso)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function Calendar({
  value,
  onChange,
  markedDates,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** Dates to flag — design 6d marks bill-due days in the month view. */
  markedDates?: Set<string>;
}) {
  const selected = fromISODate(value);
  const [view, setView] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );

  const todayIso = useToday();

  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const daysInMonth = new Date(
      view.getFullYear(),
      view.getMonth() + 1,
      0,
    ).getDate();

    // Monday-first, which is the Indian convention. getDay() is Sunday-first,
    // hence the shift.
    const leading = (first.getDay() + 6) % 7;

    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
  }, [view]);

  const shift = (months: number) =>
    setView(new Date(view.getFullYear(), view.getMonth() + months, 1));

  return (
    <div className="w-[260px]">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="rounded-lg p-1.5 text-ink-muted hover:bg-paper-raised"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="text-sm font-medium text-ink">
          {view.toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="rounded-lg p-1.5 text-ink-muted hover:bg-paper-raised"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((day, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="py-1 text-center font-mono text-[10px] text-ink-faint"
          >
            {day}
          </div>
        ))}

        {days.map((day, index) => {
          if (day === null) return <div key={`pad-${index}`} />;

          const iso = toLocalISODate(
            new Date(view.getFullYear(), view.getMonth(), day),
          );
          const isSelected = iso === value;
          const isToday = iso === todayIso;
          const isMarked = markedDates?.has(iso);

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(iso)}
              aria-label={iso}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "relative flex size-8 items-center justify-center rounded-lg text-[13px] transition-colors",
                isSelected
                  ? "bg-green font-semibold text-paper"
                  : "text-ink-soft hover:bg-paper-raised",
                isToday && !isSelected && "font-semibold text-green",
              )}
            >
              {day}
              {isMarked && !isSelected && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 size-1 rounded-full bg-attention"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
