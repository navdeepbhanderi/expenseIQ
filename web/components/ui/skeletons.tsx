"use client";

import { Skeleton } from "./feedback";
import { cn } from "@/lib/cn";

/**
 * Skeletons shaped like the thing they replace.
 *
 * A generic grey box tells the user "something is loading" and then the layout
 * jumps when the real content lands, which reads as a glitch. These mirror the
 * real component's structure — same card, same rows, same rhythm — so the page
 * settles instead of rearranging itself.
 *
 * Every one is aria-hidden, and the container carries `aria-busy`: a screen
 * reader should hear "loading", once, rather than a description of shimmering
 * rectangles.
 */

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line-strong bg-paper p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A row: mark, two lines of text, an amount. Used by most lists. */
export function RowSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Skeleton className="size-[26px] shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-32" />
        {!compact && <Skeleton className="h-3 w-20" />}
      </div>
      <Skeleton className="h-3.5 w-16 shrink-0" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6"
      aria-busy="true"
      aria-label="Loading your dashboard"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* attention rail — two dues plus the review tile */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex items-center gap-3.5 p-4">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:gap-5">
        <div className="flex flex-col gap-4 sm:gap-5">
          {/* spend card: eyebrow, big figure, budget line, bar */}
          <Card>
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-2 h-10 w-44" />
            <Skeleton className="mt-2 h-3 w-56" />
            <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
          </Card>

          {/* category bars */}
          <Card>
            <Skeleton className="h-2.5 w-24" />
            <div className="mt-3.5 flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-[26px] shrink-0 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-full max-w-[240px]" />
                    <Skeleton className="mt-1.5 h-1.5 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4 sm:gap-5">
          <Card>
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-2 h-7 w-32" />
            <Skeleton className="mt-2 h-3 w-40" />
          </Card>

          <Card>
            <Skeleton className="h-2.5 w-20" />
            <div className="mt-3.5 flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({
  title = true,
  rows = 6,
}: {
  title?: boolean;
  rows?: number;
}) {
  return (
    <div
      className="flex flex-col gap-4 p-4 sm:p-6"
      aria-busy="true"
      aria-label="Loading"
    >
      {title && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
      )}

      <Skeleton className="h-10 w-full rounded-[var(--radius-control)]" />

      <div className="flex gap-6">
        {/* filter sidebar, desktop only — mirrors the real layout */}
        <div className="hidden w-56 shrink-0 flex-col gap-5 lg:flex">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2.5">
              <Skeleton className="h-2.5 w-20" />
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="flex items-center gap-2.5">
                  <Skeleton className="size-[18px] shrink-0 rounded-[5px]" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-paper px-4">
          {Array.from({ length: rows }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReviewSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 p-4 sm:p-6"
      aria-busy="true"
      aria-label="Loading your review queue"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      {[0, 1].map((i) => (
        <Card key={i}>
          {/* heard line + confidence dots */}
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-4 w-full max-w-[280px]" />
            <Skeleton className="h-3 w-20 shrink-0" />
          </div>

          {/* the chip row */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Skeleton className="h-[34px] w-20 rounded-[var(--radius-chip)]" />
            <Skeleton className="h-[34px] w-28 rounded-[var(--radius-chip)]" />
            <Skeleton className="h-[34px] w-16 rounded-[var(--radius-chip)]" />
            <Skeleton className="h-[34px] w-24 rounded-[var(--radius-chip)]" />
          </div>

          <div className="mt-4 flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-[var(--radius-control)] sm:max-w-32" />
            <Skeleton className="h-10 w-24 rounded-[var(--radius-control)]" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function AccountsSkeleton() {
  return (
    <div
      className="flex flex-col gap-5 p-4 sm:p-6"
      aria-busy="true"
      aria-label="Loading your accounts"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-9 w-32 rounded-[var(--radius-control)]" />
      </div>

      {[0, 1].map((group) => (
        <div key={group} className="flex flex-col gap-2.5">
          <Skeleton className="h-2.5 w-24" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Card key={i} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-3.5 w-20" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AccountDetailSkeleton() {
  return (
    <div
      className="flex flex-col gap-5 p-4 sm:p-6"
      aria-busy="true"
      aria-label="Loading this account"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-40" />
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
        <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
      </Card>

      <Card>
        <Skeleton className="h-2.5 w-20" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div
      className="flex flex-col gap-5 p-4 sm:p-6"
      aria-busy="true"
      aria-label="Loading your reports"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-56 rounded-[var(--radius-control)]" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-2 h-6 w-28" />
            <Skeleton className="mt-2 h-3 w-24" />
          </Card>
        ))}
      </div>

      <Card>
        <Skeleton className="h-2.5 w-32" />
        <Skeleton className="mt-3 h-6 w-36" />
        <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
      </Card>

      {/* norms: mark, label, bar */}
      <Card>
        <Skeleton className="h-2.5 w-32" />
        <div className="mt-3.5 flex flex-col gap-3.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-[26px] shrink-0 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="mt-1.5 h-1.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* the six-month trend, as six bars of varying height */}
      <Card>
        <Skeleton className="h-2.5 w-28" />
        <div className="mt-4 flex items-end gap-2 sm:gap-3">
          {[40, 64, 32, 78, 52, 46].map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <Skeleton className="h-2.5 w-10" />
              <Skeleton
                className="w-full rounded-t-md"
                style={{ height: h }}
              />
              <Skeleton className="h-2.5 w-6" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function FamilySkeleton() {
  return (
    <div
      className="flex flex-col gap-5 p-4 sm:p-6"
      aria-busy="true"
      aria-label="Loading your family"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-24 rounded-[var(--radius-control)]" />
      </div>

      <Card>
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="mt-2 h-6 w-32" />
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 flex-1 max-w-[160px]" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Skeleton className="h-2.5 w-36" />
        <div className="mt-3 flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
