"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, PenLine, Square } from "lucide-react";
import { cn } from "@/lib/cn";
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
 * The always-present composer - design 5a/5b/5c.
 *
 * It stays on screen rather than living behind a button because the design's
 * whole argument is that logging an expense should cost one gesture. A modal
 * you have to open first is already two.
 *
 * Hold space to speak, ⏎ to add, Esc to dismiss - 5c states the shortcuts on
 * screen, so they have to actually work.
 */
export function CaptureDock({
  accounts,
  onManualEntry,
}: {
  accounts: Account[];
  /** Opens the typed form. Always shown, whatever voice is set to. */
  onManualEntry?: () => void;
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
  const [candidates, setCandidates] = useState<NluCandidate[]>([]);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  /*
   * Hold space to speak - design 5a.
   *
   * Ignored while any field has focus, or the shortcut would eat every space
   * the user types into the composer itself. Repeat events are ignored too,
   * since holding a key fires continuously.
   */
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTyping()) return;
      if (candidates.length > 0) return;

      event.preventDefault();
      speech.start();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTyping()) return;
      speech.stop();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [speech, candidates.length]);

  const patch = (index: number, changes: Partial<NluCandidate>) => {
    setCandidates((current) =>
      current.map((candidate, i) =>
        i === index
          ? {
              ...candidate,
              ...changes,
              // Clearing a missing field as it is filled is what turns the
              // marigold "Account? →" chip back into an ordinary one.
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

      setCandidates((current) =>
        current.filter((c) => c.reviewItemId !== candidate.reviewItemId),
      );

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

  const dismiss = (candidate: NluCandidate) => {
    void discard.mutateAsync(candidate.reviewItemId);
    setCandidates((current) =>
      current.filter((c) => c.reviewItemId !== candidate.reviewItemId),
    );
  };

  const listening = speech.state === "listening";
  const showCandidates = candidates.length > 0;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 hidden px-6 pb-5 pt-4 lg:block",
        // Fades the content scrolling underneath rather than cutting it off.
        "bg-gradient-to-b from-transparent to-canvas to-40%",
      )}
    >
      <div className="mx-auto max-w-3xl rounded-[var(--radius-card)] border border-line bg-paper shadow-[0_10px_26px_-18px_rgba(60,45,25,0.55)]">
        {error && (
          <Banner tone="error" className="m-3 mb-0" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        {showCandidates ? (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">
                {candidates.length === 1
                  ? "Got it - check & confirm"
                  : `Caught ${candidates.length} things`}
              </p>
              <button
                onClick={() => {
                  candidates.forEach(dismiss);
                  setCandidates([]);
                }}
                className="text-[13px] text-ink-faint hover:text-ink"
              >
                Discard all
              </button>
            </div>

            <HeardLine
              text={heard}
              band={candidates[0]!.confidenceBand}
            />

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

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => void commit(candidate)}
                      isLoading={confirm.isPending}
                      // Only amount blocks confirmation - the server says so,
                      // and a missing account is a suggestion, not an error.
                      disabled={candidate.amountMinor === null}
                    >
                      Add ⏎
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismiss(candidate)}
                    >
                      Discard
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-xs text-ink-faint">
              Tab through fields to edit · hold space again to add another
            </p>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(text);
            }}
            className="flex items-center gap-3.5 py-2.5 pl-4 pr-2.5"
          >
            <input
              ref={inputRef}
              value={listening ? speech.transcript : text}
              onChange={(event) => setText(event.target.value)}
              disabled={listening || parse.isPending}
              placeholder={
                listening
                  ? "Listening…"
                  : parse.isPending
                    ? "Reading…"
                    : "Type an expense"
              }
              aria-label="Describe an expense"
              className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
            />

            {/*
             * The way out of the parser entirely - always here, whatever
             * voice is set to. Some expenses are faster to type than to
             * describe, and the parser can be stubbornly wrong about a phrase.
             */}
            {onManualEntry && (
              <button
                type="button"
                onClick={onManualEntry}
                title="Fill it in myself"
                aria-label="Fill it in myself"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
              >
                <PenLine className="size-4" aria-hidden="true" />
              </button>
            )}

            {listening ? (
              <span className="tabular font-mono text-[13px] text-green">
                0:{String(speech.elapsed).padStart(2, "0")}
              </span>
            ) : (
              voiceEnabled &&
              speech.supported && (
                <span className="hidden text-[13px] text-ink-faint xl:inline">
                  hold{" "}
                  <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                    space
                  </kbd>{" "}
                  to speak
                </span>
              )
            )}

            {voiceEnabled && (
            <button
              type="button"
              onClick={() => (listening ? speech.stop() : speech.start())}
              aria-label={listening ? "Stop listening" : "Speak an expense"}
              disabled={!speech.supported}
              className={cn(
                "flex size-[46px] shrink-0 items-center justify-center rounded-full transition-colors",
                "bg-green text-paper shadow-[0_10px_20px_-10px_rgba(31,111,92,0.7)]",
                "disabled:bg-disabled disabled:text-disabled-ink disabled:shadow-none",
              )}
            >
              {listening ? (
                <Square className="size-4 fill-current" aria-hidden="true" />
              ) : (
                <Mic className="size-5" aria-hidden="true" />
              )}
            </button>
            )}
          </form>
        )}
      </div>

      {speech.state === "denied" && (
        <p className="mx-auto mt-2 max-w-3xl text-xs text-spend">
          Microphone access was blocked. Type instead, or allow it in your
          browser settings.
        </p>
      )}
    </div>
  );
}
