"use client";

import { useState } from "react";
import { useProfile } from "@/components/providers/profile-provider";
import { useCategories, useDashboard } from "@/lib/api/hooks";
import {
  useConfirm,
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
import { formatMinor, undoSecondsLeft } from "@/lib/money";
import { ApiError } from "@/lib/api/client";

/**
 * Review queue — design 2b (desktop) and 4e (mobile).
 *
 * One card per candidate, every field editable in place. The design's promise
 * is that a clear entry confirms in a tap and an uncertain one says exactly
 * which field it is unsure about — so the work here is making the missing
 * field obvious, not making a form.
 */
export default function ReviewPage() {
  const { activeId } = useProfile();
  const { data, isPending } = useReviewQueue(activeId);
  const { data: categories = [] } = useCategories(activeId);
  const { data: dashboard } = useDashboard(activeId);

  const confirm = useConfirm(activeId);
  const discard = useDiscard(activeId);
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
      const result = await confirm.mutateAsync({
        itemId: item.reviewItemId,
        patch: {
          categoryId: current.categoryId,
          accountId: current.accountId,
        },
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

      <Eyebrow className="mt-2">
        Nothing here has touched your ledger yet.
      </Eyebrow>
    </div>
  );
}
