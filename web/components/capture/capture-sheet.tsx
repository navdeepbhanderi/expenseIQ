"use client";

import { useCallback, useState } from "react";
import { Mic, PenLine, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/components/providers/profile-provider";
import { useCategories } from "@/lib/api/hooks";
import { useConfirm, useDiscard, useParse, useUndo } from "@/lib/api/nlu";
import { useSpeech } from "@/lib/speech";
import { ApiError } from "@/lib/api/client";
import { formatMinor, undoSecondsLeft } from "@/lib/money";
import type { Account, NluCandidate } from "@/lib/api/types";
import { CandidateCard, HeardLine } from "./candidate-card";
import { useVoiceEnabled } from "@/lib/voice-preference";

/**
 * Mobile capture — design 5f/5g.
 *
 * A sheet rather than the desktop dock, and deliberately a separate component:
 * 5g has it cover the tab bar, the actions are 58px and stacked at the bottom
 * for thumb reach, and the mic is a large target rather than a 46px circle.
 * Squeezing the dock into a media query would produce something that looks
 * right and feels wrong.
 */
export function CaptureSheet({
  open,
  onOpenChange,
  accounts,
  onManualEntry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  /** Opens the typed form — always offered, whatever voice is set to. */
  onManualEntry: () => void;
}) {
  const [voiceEnabled] = useVoiceEnabled();
  const { activeId } = useProfile();
  const { toast, undoToast } = useToast();
  const { data: categories = [] } = useCategories(activeId);

  const parse = useParse(activeId);
  const confirm = useConfirm(activeId);
  const discard = useDiscard(activeId);
  const undo = useUndo(activeId);

  const [text, setText] = useState("");
  const [heard, setHeard] = useState("");
  const [candidates, setCandidates] = useState<NluCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setText("");
    setHeard("");
    setCandidates([]);
    setError(null);
  };

  const submit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || !activeId) return;

      setError(null);
      setHeard(trimmed);

      try {
        const result = await parse.mutateAsync(trimmed);

        if (result.candidates.length === 0) {
          setError("That didn't look like an expense. Try naming an amount.");
          return;
        }

        setCandidates(result.candidates);
        setText("");
      } catch (caught) {
        setError(
          caught instanceof ApiError
            ? caught.displayMessage
            : "Couldn't read that. Try again.",
        );
      }
    },
    [activeId, parse],
  );

  const speech = useSpeech({ onFinal: (transcript) => void submit(transcript) });
  const listening = speech.state === "listening";

  const patch = (index: number, changes: Partial<NluCandidate>) => {
    setCandidates((current) =>
      current.map((candidate, i) =>
        i === index
          ? {
              ...candidate,
              ...changes,
              missingFields: candidate.missingFields.filter(
                (field) =>
                  !(field === "account" && changes.accountId) &&
                  !(field === "category" && changes.categoryId),
              ),
            }
          : candidate,
      ),
    );
  };

  const commit = async (candidate: NluCandidate) => {
    try {
      const result = await confirm.mutateAsync({
        itemId: candidate.reviewItemId,
        patch: {
          categoryId: candidate.categoryId,
          accountId: candidate.accountId,
        },
      });

      const remaining = candidates.filter(
        (c) => c.reviewItemId !== candidate.reviewItemId,
      );
      setCandidates(remaining);

      // Design 5h: confirming the last one returns the user home rather than
      // leaving them on an empty sheet.
      if (remaining.length === 0) {
        onOpenChange(false);
        reset();
      }

      const label = categories.find((c) => c.id === candidate.categoryId)?.name;

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
        title: "Couldn't add that",
        description:
          caught instanceof ApiError ? caught.displayMessage : undefined,
        tone: "error",
      });
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          speech.stop();
          // Anything left unconfirmed stays in the review queue rather than
          // being silently dropped — it is already persisted server-side.
          reset();
        }
        onOpenChange(next);
      }}
      title={
        candidates.length === 0
          ? "Add an expense"
          : candidates.length === 1
            ? "Got it — check & confirm"
            : `Caught ${candidates.length} things`
      }
      footer={
        candidates.length === 1 ? (
          <>
            <Button
              size="mobile"
              onClick={() => void commit(candidates[0]!)}
              isLoading={confirm.isPending}
              disabled={candidates[0]!.amountMinor === null}
            >
              Looks right
            </Button>
            <Button
              size="mobile"
              variant="secondary"
              onClick={() => {
                void discard.mutateAsync(candidates[0]!.reviewItemId);
                onOpenChange(false);
                reset();
              }}
            >
              Discard
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="error">{error}</Banner>}

        {candidates.length === 0 ? (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit(text);
              }}
            >
              <input
                value={listening ? speech.transcript : text}
                onChange={(event) => setText(event.target.value)}
                disabled={listening || parse.isPending}
                placeholder={
                  listening
                    ? "Listening…"
                    : parse.isPending
                      ? "Reading…"
                      : "300 रुपये किराने पे खर्च किए"
                }
                aria-label="Describe an expense"
                // 16px minimum, or iOS Safari zooms the page on focus and the
                // sheet ends up half off-screen.
                className="h-[52px] w-full rounded-[14px] border border-line bg-field px-4 text-base text-ink outline-none placeholder:text-ink-faint"
              />
            </form>

            <div className="flex flex-col items-center gap-3 py-4">
              {voiceEnabled && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      listening ? speech.stop() : speech.start()
                    }
                    aria-label={
                      listening ? "Stop listening" : "Speak an expense"
                    }
                    disabled={!speech.supported}
                    className={cn(
                      "flex size-20 items-center justify-center rounded-full transition-transform active:scale-95",
                      "bg-green text-paper shadow-[0_12px_24px_-10px_rgba(31,111,92,0.7)]",
                      "disabled:bg-disabled disabled:text-disabled-ink disabled:shadow-none",
                      listening && "animate-pulse",
                    )}
                  >
                    {listening ? (
                      <Square className="size-6 fill-current" aria-hidden="true" />
                    ) : (
                      <Mic className="size-8" aria-hidden="true" />
                    )}
                  </button>

                  <p className="text-sm text-ink-muted">
                    {listening
                      ? `Listening · 0:${String(speech.elapsed).padStart(2, "0")}`
                      : speech.supported
                        ? "Tap and say what you spent"
                        : "Type it above — this browser can't listen"}
                  </p>
                </>
              )}

              {/*
               * The way out of the parser entirely.
               *
               * Offered whether or not voice is on, because the parser can be
               * wrong about a stubborn phrase and because some expenses are
               * simply faster to type than to describe.
               */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onManualEntry}
                className="text-ink-muted"
              >
                <PenLine className="size-4" aria-hidden="true" />
                Fill it in myself
              </Button>
            </div>
          </>
        ) : (
          <>
            <HeardLine text={heard} band={candidates[0]!.confidenceBand} />

            <ul className="flex flex-col gap-4">
              {candidates.map((candidate, index) => (
                <li
                  key={candidate.reviewItemId}
                  className="flex flex-col gap-3 border-t border-line-soft pt-4 first:border-0 first:pt-0"
                >
                  <CandidateCard
                    candidate={candidate}
                    categories={categories}
                    accounts={accounts}
                    onChange={(changes) => patch(index, changes)}
                  />

                  {/* Multi-entry keeps its actions per row; a single entry
                      uses the sheet footer, where the thumb already is. */}
                  {candidates.length > 1 && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => void commit(candidate)}
                        disabled={candidate.amountMinor === null}
                      >
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void discard.mutateAsync(candidate.reviewItemId);
                          setCandidates((c) =>
                            c.filter(
                              (x) => x.reviewItemId !== candidate.reviewItemId,
                            ),
                          );
                        }}
                      >
                        Discard
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
