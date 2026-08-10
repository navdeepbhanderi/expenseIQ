"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { CategoryMark } from "@/components/ui/display";

/**
 * The hero's "Heard just now" card — design 8a.
 *
 * The design leads with the resolved amount at 56px Newsreader, not with the
 * chips: the point being made is that a spoken sentence becomes a number you
 * can check at a glance. The raw utterance sits above it in muted ink, as
 * evidence rather than as the headline.
 *
 * The due tile is absolutely positioned so it overhangs the card's bottom
 * corner. That overlap is what makes the pair read as one composition instead
 * of two stacked boxes.
 *
 * Phrases are the real multilingual inputs the backend was tested against.
 */

interface Sample {
  utterance: string;
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
    amount: "₹300",
    category: "Groceries",
    monogram: "GR",
    tint: "#E7F0EA",
    when: "Today",
    account: "SBI Savings",
  },
  {
    utterance: "kal swiggy se 482 ka order kiya",
    amount: "₹482",
    category: "Eating out",
    monogram: "EA",
    tint: "#F6E5E1",
    when: "Yesterday",
    account: "HDFC Millennia",
  },
  {
    utterance: "આજે પેટ્રોલ ૧૨૦૦ નું ભરાવ્યું",
    amount: "₹1,200",
    category: "Fuel",
    monogram: "FU",
    tint: "#FBEEDA",
    when: "Today",
    account: "HDFC Millennia",
  },
];

function Pip({ filled }: { filled: boolean }) {
  return (
    <span
      className={cn(
        "size-1.5 rounded-full",
        filled ? "bg-income" : "bg-line",
      )}
    />
  );
}

export function ParseDemo() {
  const [index, setIndex] = useState(0);
  const sample = SAMPLES[index]!;

  useEffect(() => {
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % SAMPLES.length),
      4200,
    );
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div className="relative w-full max-w-[440px]">
      <div className="rounded-[20px] border border-line-strong bg-paper p-5 shadow-[0_30px_64px_-34px_rgba(60,45,25,0.7)] sm:p-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-faint">
            Heard just now
          </span>
          <span className="flex items-center gap-1.5">
            <span className="flex gap-[3px]" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <Pip key={i} filled />
              ))}
            </span>
            <span className="text-xs text-ink-muted">Clear</span>
          </span>
        </div>

        <div key={sample.utterance} className="animate-fade-in">
          <p className="mt-3.5 text-[17px] text-ink-faint sm:text-[18px]">
            &ldquo;{sample.utterance}&rdquo;
          </p>

          {/* The figure is the point. Newsreader, big, unmissable. */}
          <p
            className="mt-1.5 font-display text-[44px] leading-none text-ink sm:text-[56px]"
            // Announced as one settled result rather than per frame.
            aria-live="polite"
            aria-atomic="true"
          >
            {sample.amount}
          </p>

          <div className="mt-3.5 flex flex-wrap gap-2">
            <span className="flex items-center gap-[7px] rounded-xl border border-line-strong bg-paper-raised py-2.5 pl-2.5 pr-3 text-[15px] text-ink">
              <CategoryMark
                monogram={sample.monogram}
                tint={sample.tint}
                size="sm"
              />
              {sample.category}
            </span>
            <span className="rounded-xl border border-line-strong bg-paper-raised px-3 py-2.5 text-[15px] text-ink">
              {sample.when}
            </span>
            <span className="rounded-xl border border-line-strong bg-paper-raised px-3 py-2.5 text-[15px] text-ink">
              {sample.account}
            </span>
          </div>
        </div>

        {/*
         * Decorative: this is a picture of the product, not the product. Real
         * confirm controls live in the app, and a screen-reader user tabbing
         * into a marketing illustration expecting to confirm an expense would
         * be misled.
         */}
        <div className="mt-4.5 flex gap-2.5" aria-hidden="true">
          <div className="flex-1 rounded-[13px] bg-green py-3.5 text-center text-base font-semibold text-paper">
            Looks right
          </div>
          <div className="rounded-[13px] border border-line px-5 py-3.5 text-center text-base text-ink-soft">
            Edit
          </div>
        </div>
      </div>

      {/*
       * Overhangs the card's corner — the overlap is what makes these read as
       * one composition. Tucked inside the card on the smallest screens, where
       * a negative offset would push it off the viewport.
       */}
      <div
        aria-hidden="true"
        className={cn(
          "mt-3 flex items-center gap-3 rounded-2xl border border-attention-line bg-attention-soft px-4 py-3.5",
          "shadow-[0_20px_44px_-26px_rgba(60,45,25,0.8)]",
          "sm:absolute sm:-bottom-7 sm:-right-4 sm:mt-0",
        )}
      >
        <span className="flex size-9 flex-col items-center justify-center rounded-xl bg-attention font-mono leading-[1.05] text-white">
          <span className="text-xs font-semibold">12</span>
          <span className="text-[8px]">AUG</span>
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">
            HDFC Card · ₹23,480
          </p>
          <p className="text-[13px] text-attention-ink">Due in 7 days</p>
        </div>
      </div>
    </div>
  );
}
