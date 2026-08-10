"use client";

import { useEffect, useState } from "react";
import { Check, Mic } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CategoryMark } from "@/components/ui/display";
import { Chip } from "@/components/ui/controls";
import { ConfidenceDots } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

/**
 * The hero's animated proof — design 8a's "Heard just now" card.
 *
 * Built from the real primitives rather than a screenshot, so it cannot drift
 * from the product and renders correctly in Night Ledger.
 *
 * The phrases are genuine multilingual inputs the backend was tested against
 * and parsed correctly in live testing — not marketing invention.
 */

interface Sample {
  utterance: string;
  language: string;
  amount: string;
  category: string;
  monogram: string;
  tint: string;
  when: string;
  account: string;
}

const SAMPLES: Sample[] = [
  {
    utterance: "300 रुपये किराने पे खर्च किए",
    language: "Hindi",
    amount: "₹300",
    category: "Groceries",
    monogram: "GR",
    tint: "#E7F0EA",
    when: "Today",
    account: "SBI Savings",
  },
  {
    utterance: "kal swiggy se 482 ka order kiya",
    language: "Hinglish",
    amount: "₹482",
    category: "Eating out",
    monogram: "EA",
    tint: "#F6E5E1",
    when: "Yesterday",
    account: "HDFC Millennia",
  },
  {
    utterance: "આજે પેટ્રોલ ૧૨૦૦ નું ભરાવ્યું",
    language: "Gujarati",
    amount: "₹1,200",
    category: "Fuel",
    monogram: "FU",
    tint: "#FBEEDA",
    when: "Today",
    account: "HDFC Millennia",
  },
];

type Stage = "listening" | "parsed";

export function ParseDemo() {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("listening");
  const sample = SAMPLES[index]!;

  useEffect(() => {
    // Listen, resolve, hold, advance. Long enough to read the Devanagari,
    // short enough that nobody waits for it.
    const toParsed = setTimeout(() => setStage("parsed"), 1400);
    const toNext = setTimeout(() => {
      setStage("listening");
      setIndex((i) => (i + 1) % SAMPLES.length);
    }, 5200);

    return () => {
      clearTimeout(toParsed);
      clearTimeout(toNext);
    };
  }, [index]);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <Card className="overflow-hidden shadow-[var(--shadow-popover)]">
        <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
              stage === "listening"
                ? "bg-green text-paper"
                : "bg-green-soft text-green",
            )}
          >
            {stage === "listening" ? (
              <Mic className="size-4" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
              {stage === "listening" ? "Listening" : "Heard just now"}
            </p>
            <p
              key={sample.utterance}
              className="animate-fade-in truncate text-[15px] text-ink"
            >
              &ldquo;{sample.utterance}&rdquo;
            </p>
          </div>

          {stage === "listening" ? (
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-0.5 rounded-full bg-green"
                  style={{
                    height: [10, 16, 12][i],
                    animation: `wave 900ms ${i * 140}ms ease-in-out infinite`,
                  }}
                />
              ))}
            </span>
          ) : (
            <ConfidenceDots band="CLEAR" className="shrink-0" />
          )}
        </div>

        <div
          className="px-5 py-4"
          // Screen readers get the resolved entry once, not every frame.
          aria-live="polite"
          aria-atomic="true"
        >
          {stage === "parsed" ? (
            <div className="animate-slide-up">
              <div className="flex flex-wrap gap-2">
                <Chip tone="mono">{sample.amount}</Chip>
                <Chip>
                  <CategoryMark
                    monogram={sample.monogram}
                    tint={sample.tint}
                    size="sm"
                  />
                  {sample.category}
                </Chip>
                <Chip>{sample.when}</Chip>
                <Chip>{sample.account}</Chip>
              </div>

              <div className="mt-4 flex gap-2">
                <Button size="sm" className="flex-1" tabIndex={-1}>
                  Looks right
                </Button>
                <Button size="sm" variant="secondary" tabIndex={-1}>
                  Edit
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2" aria-hidden="true">
              <span className="h-[34px] w-20 animate-pulse rounded-[--radius-chip] bg-line-soft" />
              <span className="h-[34px] w-32 animate-pulse rounded-[--radius-chip] bg-line-soft" />
              <span className="h-[34px] w-16 animate-pulse rounded-[--radius-chip] bg-line-soft" />
            </div>
          )}
        </div>
      </Card>

      {/*
       * The due tile from 8a. Marigold, because a due date is the app's other
       * "needs your eye" — the same colour, used for the same reason.
       */}
      <Card className="flex items-center gap-3.5 border-attention-line bg-attention-soft p-4 shadow-[inset_3px_0_0_var(--attention)]">
        <span className="flex size-10 flex-col items-center justify-center rounded-xl bg-attention font-mono leading-none text-[#3B2E14]">
          <span className="text-sm font-semibold">12</span>
          <span className="mt-0.5 text-[9px]">AUG</span>
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-attention-ink">
            HDFC Card · ₹23,480
          </p>
          <p className="mt-0.5 text-xs text-attention-ink/80">Due in 7 days</p>
        </div>
      </Card>
    </div>
  );
}
