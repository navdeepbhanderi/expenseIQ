"use client";

import { useEffect, useState } from "react";
import { Check, Mic } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CategoryMark } from "@/components/ui/display";
import { Chip } from "@/components/ui/controls";
import { ConfidenceDots } from "@/components/ui/feedback";

/**
 * The hero's animated proof.
 *
 * Shows the actual product loop — speak, parse, confirm — using the real
 * component primitives rather than a screenshot, so it stays truthful as the
 * design evolves and renders correctly in both themes.
 *
 * The phrases are genuine multilingual inputs the backend was tested against,
 * not marketing invention: each of these was parsed correctly in live testing.
 */

interface Sample {
  utterance: string;
  language: string;
  amount: string;
  category: string;
  monogram: string;
  tint: string;
  when: string;
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
  },
  {
    utterance: "kal swiggy se 482 ka order kiya",
    language: "Hinglish",
    amount: "₹482",
    category: "Eating out",
    monogram: "EA",
    tint: "#F6E5E1",
    when: "Yesterday",
  },
  {
    utterance: "આજે પેટ્રોલ ૧૨૦૦ નું ભરાવ્યું",
    language: "Gujarati",
    amount: "₹1,200",
    category: "Fuel",
    monogram: "FU",
    tint: "#FBEEDA",
    when: "Today",
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
    }, 4600);

    return () => {
      clearTimeout(toParsed);
      clearTimeout(toNext);
    };
  }, [index]);

  return (
    <Card className="w-full max-w-md overflow-hidden p-0 shadow-[var(--shadow-popover)]">
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
            {stage === "listening" ? "Listening" : sample.language}
          </p>
          <p
            key={sample.utterance}
            className="animate-fade-in truncate text-[15px] text-ink"
          >
            {sample.utterance}
          </p>
        </div>

        {stage === "listening" && (
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
        )}
      </div>

      <div
        className="px-5 py-4"
        // Screen readers get the resolved entry once, not every frame of the
        // animation.
        aria-live="polite"
        aria-atomic="true"
      >
        {stage === "parsed" ? (
          <div className="animate-slide-up">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                Reading as
              </p>
              <ConfidenceDots band="CLEAR" />
            </div>

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
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2" aria-hidden="true">
            <span className="h-[34px] w-20 animate-pulse rounded-[--radius-chip] bg-line-soft" />
            <span className="h-[34px] w-28 animate-pulse rounded-[--radius-chip] bg-line-soft" />
            <span className="h-[34px] w-16 animate-pulse rounded-[--radius-chip] bg-line-soft" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line-soft bg-paper-raised px-5 py-3">
        <span className="text-xs text-ink-muted">
          Nothing is saved until you confirm it.
        </span>
      </div>
    </Card>
  );
}
