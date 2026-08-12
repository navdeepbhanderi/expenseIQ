"use client";

import { useState } from "react";
import { useProfile } from "@/components/providers/profile-provider";
import { useCategories, useDashboard } from "@/lib/api/hooks";
import {
  useConfirm,
  useEditReviewItem,
  useDiscard,
  useReviewQueue,
  useUndo,
  type ReviewQueueItem,
} from "@/lib/api/nlu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { ReviewSkeleton } from "@/components/ui/skeletons";
import { Eyebrow } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { CandidateCard, HeardLine } from "@/components/capture/candidate-card";
import { ReviewEditModal } from "@/components/review/review-edit-modal";
import { formatMinor, undoSecondsLeft } from "@/lib/money";
import { ApiError } from "@/lib/api/client";
import { useNluAccuracy } from "@/lib/api/settings";

/**
 * Review queue - design 2b (desktop) and 4e (mobile).
 *
 * One card per candidate, every field editable in place. The design's promise
 * is that a clear entry confirms in a tap and an uncertain one says exactly
 * which field it is unsure about - so the work here is making the missing
 * field obvious, not making a form.
 */
export default function ReviewPage() {
  const { activeId } = useProfile();
  const { data, isPending } = useReviewQueue(activeId);
  const { data: categories = [] } = useCategories(activeId);
  const { data: dashboard } = useDashboard(activeId);

  const accuracy = useNluAccuracy(activeId);
  const confirm = useConfirm(activeId);
  const discard = useDiscard(activeId);
  const [editing, setEditing] = useState<string | null>(null);
  const edit = useEditReviewItem(activeId);
  const undo = useUndo(activeId);
  const { toast, undoToast } = useToast();

  // Local edits, keyed by item. The server is the source of truth for what is
  // in the queue; this only holds corrections not yet committed.
  const [edits, setEdits] = useState<
    Record<string, { categoryId?: string | null; accountId?: string | null }>
  >({});

  const accounts = dashboard?.accounts ?? [];
  const items = data?.items ?? [];

  const merged = (item: ReviewQueueItem): ReviewQueueItem => {
    const edit = edits[item.reviewItemId];
    if (!edit) return item;

    return {
      ...item,
      ...edit,
      missingFields: item.missingFields.filter(
        (field) =>
          !(field === "account" && edit.accountId) &&
          !(field === "category" && edit.categoryId),
      ),
    };
  };

  async function commit(item: ReviewQueueItem) {
    const current = merged(item);

    try {
      /*
       * Save the chip edits before confirming.
       *
       * `POST /confirm` takes no body — the server reads the item's own
       * parsed fields — so passing the edits to it did nothing at all: every
       * category or account changed by tapping a chip was silently discarded
       * and the entry went into the ledger as first parsed.
       *
       * PATCH is also what records the change as a Correction, which is what
       * the accuracy figure and the category learning are built on.
       */
      const pending = edits[item.reviewItemId];
      if (pending) {
        // Only the fields actually chosen. A chip cleared back to nothing is
        // not expressible here — the edit endpoint takes a value or omits it.
        const patch = {
          ...(pending.categoryId ? { categoryId: pending.categoryId } : {}),
          ...(pending.accountId ? { accountId: pending.accountId } : {}),
        };

        if (Object.keys(patch).length > 0) {
          await edit.mutateAsync({ itemId: item.reviewItemId, patch });
        }
      }

      const result = await confirm.mutateAsync({
        itemId: item.reviewItemId,
      });

      const label = categories.find((c) => c.id === current.categoryId)?.name;

      // `undo` is null once the window has closed, so the toast only offers
      // the action when there is genuinely something to redeem.
      if (result.undo) {
        const token = result.undo.token;
        undoToast(
          `Added ${formatMinor(result.transaction.amountMinor)}${label ? ` to ${label}` : ""}`,
          () => void undo.mutateAsync(token),
          undoSecondsLeft(result.undo.expiresAt),
        );
      } else {
        toast({
          title: `Added ${formatMinor(result.transaction.amountMinor)}${label ? ` to ${label}` : ""}`,
          tone: "success",
        });
      }
    } catch (caught) {
      toast({
        title: "Couldn't confirm that",
        description:
          caught instanceof ApiError ? caught.displayMessage : undefined,
        tone: "error",
      });
    }
  }

  if (isPending) return <ReviewSkeleton />;

  if (items.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="mb-4 font-display text-2xl text-ink">Review</h1>
        <EmptyState title="Nothing waiting">
          Everything you&rsquo;ve said is already in the ledger. Speak or type
          an expense and it will appear here first.
        </EmptyState>

        {accuracy.data && accuracy.data.total >= 5 && (
          <p className="mt-3 text-center text-xs text-ink-faint">
            {accuracy.data.correctFirstTime} of {accuracy.data.total} read
            correctly on the first try over the last {accuracy.data.windowDays}{" "}
            days
          </p>
        )}
      </div>
    );
  }

  const clear = items.filter((i) => i.confidenceBand === "CLEAR").length;
  const needing = items.length - clear;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl text-ink sm:text-[27px]">
          {items.length} to confirm
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          {clear > 0 && `${clear} look clear`}
          {clear > 0 && needing > 0 && " · "}
          {needing > 0 && `${needing} need a field picked`}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const current = merged(item);

          return (
            <li
              key={item.reviewItemId}
              className="rounded-[var(--radius-card)] border border-line-strong bg-paper p-4 sm:p-5"
            >
              {item.rawText && (
                <HeardLine
                  text={item.rawText}
                  band={current.confidenceBand}
                  className="mb-3.5"
                />
              )}

              <CandidateCard
                candidate={current}
                categories={categories}
                accounts={accounts}
                onChange={(patch) =>
                  setEdits((all) => ({
                    ...all,
                    [item.reviewItemId]: {
                      ...all[item.reviewItemId],
                      ...patch,
                    },
                  }))
                }
              />

              {editing === item.reviewItemId && (
                <ReviewEditModal
                  open
                  onOpenChange={(next) => !next && setEditing(null)}
                  item={{ ...current, reviewItemId: item.reviewItemId }}
                  categories={categories}
                  accounts={accounts}
                />
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  size="mobile"
                  className="sm:h-10 sm:w-auto sm:flex-1 sm:rounded-[var(--radius-control)] sm:text-sm"
                  onClick={() => void commit(item)}
                  isLoading={confirm.isPending}
                  disabled={current.amountMinor === null}
                >
                  Looks right
                </Button>
                {/* The amount, date, merchant and note are unreachable from
                    the chips, so a misheard figure had no remedy but discard
                    and say it again. */}
                <Button
                  size="mobile"
                  variant="secondary"
                  className="sm:h-10 sm:w-auto sm:rounded-[var(--radius-control)] sm:text-sm"
                  onClick={() => setEditing(item.reviewItemId)}
                >
                  Fix details
                </Button>
                <Button
                  size="mobile"
                  variant="secondary"
                  className="sm:h-10 sm:w-auto sm:rounded-[var(--radius-control)] sm:text-sm"
                  onClick={() => void discard.mutateAsync(item.reviewItemId)}
                >
                  Discard
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-col gap-1">
        <Eyebrow>Nothing here has touched your ledger yet.</Eyebrow>

        {/*
         * Design 2b's accuracy line. Shown only once there is enough to
         * measure - "0 of 0 read correctly" is not a statistic, it is noise.
         */}
        {accuracy.data && accuracy.data.total >= 5 && (
          <p className="text-xs text-ink-faint">
            {accuracy.data.correctFirstTime} of {accuracy.data.total} entries
            read correctly on the first try over the last{" "}
            {accuracy.data.windowDays} days
            {accuracy.data.mostCorrectedField &&
              ` · ${accuracy.data.mostCorrectedField} needs the most fixing`}
          </p>
        )}
      </div>
    </div>
  );
}
