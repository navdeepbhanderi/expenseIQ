import type { Metadata } from "next";
import Link from "next/link";
import {
  CreditCard,
  Layers,
  Mic,
  PiggyBank,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/display";
import { ParseDemo } from "@/components/marketing/parse-demo";

export const metadata: Metadata = {
  title: "ExpenseIQ — Say it, and it's tracked",
  description:
    "Speak an expense in Hindi, Gujarati or Hinglish and ExpenseIQ files it correctly. Budgets, credit cards, loans and family spending — without the data entry.",
};

/*
 * The landing page.
 *
 * Not in the design system — screens 2a–6i are all post-login — so this is
 * built from the same tokens and components rather than a different visual
 * language. Everything claimed here is a capability the API actually has;
 * "coming soon" is a promise this page does not make.
 */

const FEATURES = [
  {
    icon: Mic,
    title: "Speak it in your language",
    body: "Hindi, Gujarati, Hinglish, English, or all of them in one sentence. “petrol bharwaya 1200” is understood as written — nothing is translated back at you.",
  },
  {
    icon: Layers,
    title: "One sentence, several expenses",
    body: "“groceries 300, uber 640, and bijli ka bill 2400” becomes three separate entries, each with its own category and date.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing enters unconfirmed",
    body: "Every parsed entry waits in a review queue with its confidence shown. Clear ones confirm in a tap; uncertain ones say exactly which field they are unsure about.",
  },
  {
    icon: CreditCard,
    title: "Cards and loans, done properly",
    body: "Statement and due dates that clamp correctly in February, minimum due, utilisation, EMI schedules, and a prepayment simulator that shows what a lump sum actually saves.",
  },
  {
    icon: PiggyBank,
    title: "Budgets that know your habits",
    body: "Per-category budgets, month-over-month comparison, and a rolling baseline — “74% of your usual ₹25,000 on groceries” — instead of a number with no context.",
  },
  {
    icon: Users,
    title: "Family without surveillance",
    body: "Shared profiles, per-child spend limits, monthly allowances and savings goals. Limits nudge and inform; they never block an entry, because an unrecorded expense is worse than a visible one.",
  },
  {
    icon: Receipt,
    title: "Scan the bill",
    body: "Photograph a receipt or drop in a PDF. The total, merchant and date land in the same review queue as everything else.",
  },
  {
    icon: RefreshCw,
    title: "Recurring, noticed for you",
    body: "Rent, EMIs and subscriptions are detected from your own history and suggested before they become rules. Auto-debits are flagged so a due date is never a surprise.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Say it or type it",
    body: "Hold the mic and speak, or type a line. No forms, no dropdowns, no deciding which field goes where.",
  },
  {
    step: "02",
    title: "Check what it heard",
    body: "The entry appears with amount, category, date and account already filled, and its confidence shown honestly.",
  },
  {
    step: "03",
    title: "Confirm in a tap",
    body: "One tap files it. Got it wrong? Fix the field it flagged, or undo for ten seconds after.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-line-soft bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div>
              <Eyebrow>Expense tracking for how India actually speaks</Eyebrow>

              <h1 className="mt-4 font-display text-[40px] font-medium leading-[1.08] text-ink sm:text-[56px]">
                Say it, and it&rsquo;s tracked.
              </h1>

              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-muted">
                Most expense apps die at data entry. ExpenseIQ removes it: speak
                a line in Hindi, Gujarati or Hinglish and it arrives filed,
                categorised and dated — waiting for one tap to confirm.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="md" className="h-12 px-6 text-base">
                  <Link href="/signup">Start tracking free</Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  className="h-12 px-6 text-base"
                >
                  <Link href="#how">See how it works</Link>
                </Button>
              </div>

              <p className="mt-4 text-[13px] text-ink-faint">
                No card required · Your data stays yours
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <ParseDemo />
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- problem */}
      <section className="border-b border-line-soft bg-paper-sunken">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center sm:px-8">
          <h2 className="font-display text-3xl font-medium leading-tight text-ink sm:text-[38px]">
            The tracking isn&rsquo;t the hard part. The typing is.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-muted">
            Everyone abandons expense apps in the same place — three weeks in,
            twelve entries behind, staring at a form with an amount field, a
            category dropdown and a date picker. ExpenseIQ starts from the
            sentence you would have said out loud anyway.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------- features */}
      <section id="features" className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <Eyebrow>What it does</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-medium text-ink sm:text-[38px]">
              Built for the money you actually have
            </h2>
            <p className="mt-3 text-[17px] leading-relaxed text-ink-muted">
              Credit card cycles, home loans, shared family spending, the
              subscription you forgot about. Not a spreadsheet with a nicer
              font.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="flex flex-col gap-3 p-5">
                <span className="flex size-10 items-center justify-center rounded-[--radius-control] bg-green-soft text-green">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
                <p className="text-[13px] leading-relaxed text-ink-muted">
                  {body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section id="how" className="border-y border-line-soft bg-paper-sunken">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-medium text-ink sm:text-[38px]">
              Three steps, about four seconds
            </h2>
          </div>

          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map(({ step, title, body }) => (
              <li key={step}>
                <Card className="h-full p-6">
                  <span className="font-mono text-sm font-semibold text-green">
                    {step}
                  </span>
                  <h3 className="mt-3 font-display text-xl font-medium text-ink">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {body}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- trust */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <Eyebrow>Where the AI stops</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-medium text-ink sm:text-[38px]">
                It reads. You decide.
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">
                A model that quietly writes to your ledger is a model you have
                to audit. ExpenseIQ never does that. Every parsed entry lands in
                a review queue with its confidence attached, and the ledger only
                changes when you say so.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "Confidence, shown honestly",
                  "Entries are marked clear, fairly sure, or missing a field — and the uncertain field is named rather than guessed.",
                ],
                [
                  "Ten seconds to undo",
                  "Confirmed something too fast? Undo restores it exactly, including the account balance.",
                ],
                [
                  "It learns from corrections",
                  "Every edit is recorded, so the merchant you renamed and the category you moved stay fixed next time.",
                ],
                [
                  "Your own numbers, not averages",
                  "Baselines come from your history — not a benchmark of what someone thinks you should spend.",
                ],
              ].map(([title, body]) => (
                <Card key={title} className="p-5">
                  <h3 className="text-sm font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                    {body}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className="border-t border-line-soft bg-paper-sunken">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center sm:px-8 sm:py-20">
          <h2 className="font-display text-3xl font-medium leading-tight text-ink sm:text-[42px]">
            Log your first expense in about four seconds.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-ink-muted">
            Create an account, add one bank or card, and say what you spent.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild className="h-12 px-7 text-base">
              <Link href="/signup">Create your account</Link>
            </Button>
            <Button asChild variant="secondary" className="h-12 px-7 text-base">
              <Link href="/login">I already have one</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
