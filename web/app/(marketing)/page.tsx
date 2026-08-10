import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  Check,
  CreditCard,
  Download,
  FileText,
  Keyboard,
  Layers,
  Mail,
  Mic,
  Moon,
  PiggyBank,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Split,
  Sparkles,
  Users,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/display";
import { Pill } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/display";
import { ParseDemo } from "@/components/marketing/parse-demo";

export const metadata: Metadata = {
  title: "ExpenseIQ — Just say what you spent",
  description:
    "Speak an expense in Hindi, Gujarati or Hinglish and ExpenseIQ turns it into a proper ledger entry — categorised, tied to the right account, and always shown to you before it's saved.",
};

/*
 * Landing page — design 8a (web) and 8b (mobile).
 *
 * Everything the design specifies is here. Where a claim describes something
 * the product cannot do yet it carries a `Soon` pill, and two claims were
 * corrected outright rather than tagged:
 *
 *   - "Data stays in India" is a deployment claim, and nothing is deployed.
 *   - The badge named Marathi and Tamil; the backend was verified in Hindi,
 *     Gujarati and Hinglish. The model handles more, but the badge should
 *     name what was actually tested.
 *
 * A landing page is a promise made before anyone can check it, which is
 * exactly why it should not overstate.
 */

const FEATURES = [
  {
    icon: Mic,
    title: "Speak it in your language",
    body: "Hindi, Gujarati, Hinglish, English — or all of them in one sentence. “petrol bharwaya 1200” is understood as written; nothing is translated back at you.",
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
    body: "Shared profiles, per-child spend limits, allowances and savings goals. Limits nudge and inform; they never block an entry, because an unrecorded expense is worse than a visible one.",
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

/** `soon: true` means the API genuinely cannot do this yet. */
const EXTRAS = [
  {
    icon: Mail,
    title: "Gmail receipts",
    body: "Opt-in, read-only. Card alerts become drafts you approve.",
    soon: true,
  },
  {
    icon: Calendar,
    title: "Calendar due dates",
    body: "Card and EMI dates in your own calendar, three days ahead.",
    soon: true,
  },
  {
    icon: Split,
    title: "Split & settle",
    body: "“split dinner 2400 four ways” tracks who still owes you.",
    soon: true,
  },
  {
    icon: FileText,
    title: "Monthly report",
    body: "A plain-English summary on the 1st: what moved, what's due.",
    soon: true,
  },
  {
    icon: Download,
    title: "Export & tax-ready",
    body: "CSV today. Excel and an FY PDF your CA will accept are coming.",
  },
  {
    icon: Moon,
    title: "Light & night themes",
    body: "Paper-warm by day, warm charcoal at night.",
  },
  {
    icon: Keyboard,
    title: "Keyboard-first desktop",
    body: "Hold space to speak, ⏎ to confirm, E to edit.",
  },
  {
    icon: Sparkles,
    title: "Learns your corrections",
    body: "Fix a category once and “kirana” is yours forever.",
  },
  {
    icon: UsersRound,
    title: "Multi-profile switching",
    body: "Personal, household and kids' ledgers under one login.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Say it, however you say it",
    body: "English, Hindi, or the mix everyone actually speaks. Type it if you'd rather.",
  },
  {
    step: "02",
    title: "We read it, you confirm",
    body: "Amount, category, account, date — laid out plainly with how sure we are. One tap and it's in.",
  },
  {
    step: "03",
    title: "Your month adds up",
    body: "Cards, EMIs and bills in one place, with dues surfaced before they bite.",
  },
];

const PLANS = [
  {
    name: "Personal",
    price: "Free",
    cadence: "forever, one profile",
    cta: "Start free",
    features: [
      { label: "Unlimited voice & text entries" },
      { label: "All accounts, cards and loans" },
      { label: "Export to CSV" },
      { label: "Gmail & Calendar integrations", soon: true },
    ],
  },
  {
    name: "Family",
    price: "₹99",
    cadence: "/month · up to 6 profiles",
    highlight: "Most chosen",
    cta: "Start free",
    features: [
      { label: "Everything in Personal" },
      { label: "Shared household ledger" },
      { label: "Kid profiles, limits & allowances" },
      { label: "Split & settle between members", soon: true },
    ],
  },
  {
    name: "Pro",
    price: "₹249",
    cadence: "/month · freelancers & small business",
    cta: "Start free",
    features: [
      { label: "Everything in Family" },
      { label: "Business vs personal ledgers", soon: true },
      { label: "GST-tagged expenses", soon: true },
      { label: "Financial-year reports for your CA", soon: true },
    ],
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="border-b border-line-soft bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-green/25 bg-green-soft px-3 py-1.5 text-[13px] font-medium text-green-hover">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Understands Hindi, Gujarati &amp; Hinglish
              </span>

              <h1 className="mt-5 font-display text-[40px] font-medium leading-[1.06] text-ink sm:text-[58px]">
                Just say what you spent.
              </h1>

              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-muted">
                ExpenseIQ turns{" "}
                <span className="text-ink">
                  &ldquo;300 रुपये किराने पे खर्च किए&rdquo;
                </span>{" "}
                into a proper ledger entry — categorised, tied to the right
                account, and always shown to you before it&rsquo;s saved.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="h-12 px-6 text-base">
                  <Link href="/signup">Start free — 2 minutes</Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  className="h-12 px-6 text-base"
                >
                  <Link href="#how">See how it reads</Link>
                </Button>
              </div>

              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-muted">
                {[
                  "No bank credentials",
                  "Your data is never sold",
                  "Free for personal use",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check
                      className="size-3.5 text-green"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-center lg:justify-end">
              <ParseDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section id="how" className="border-b border-line-soft bg-paper-sunken">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-medium text-ink sm:text-[38px]">
              Three steps, four seconds
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

      {/* ---------------------------------------------------------- extras */}
      <section className="border-y border-line-soft bg-paper-sunken">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-2xl">
              <Eyebrow>And the rest of it</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-medium text-ink sm:text-[38px]">
                Everything else you&rsquo;d expect
              </h2>
            </div>
            <p className="text-[13px] text-ink-faint">
              Items marked <Pill tone="soon">Soon</Pill> are in development.
            </p>
          </div>

          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXTRAS.map(({ icon: Icon, title, body, soon }) => (
              <Card key={title} className="flex gap-3.5 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-paper-raised text-ink-muted">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {title}
                    {soon && <Pill tone="soon">Soon</Pill>}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                    {body}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- families */}
      <section id="families" className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <Eyebrow>Families</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-medium text-ink sm:text-[38px]">
                One household, separate ledgers
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">
                A shared profile for the household, a personal one for you, and
                a limited one for each child. Everyone adds to the same picture
                without everyone seeing every line.
              </p>

              <ul className="mt-6 flex flex-col gap-3">
                {[
                  "Kid profiles see their own allowance and goals, not the family's card balances.",
                  "Spend limits nudge at 80% and flag the owner when crossed — they never block an entry.",
                  "Credit products and automated inboxes are refused on a child profile by the server, not just hidden.",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5 text-sm text-ink-soft">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-green"
                      aria-hidden="true"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <figure className="flex flex-col justify-center">
              <Card className="p-6">
                <blockquote className="font-display text-xl leading-relaxed text-ink sm:text-2xl">
                  &ldquo;I stopped tracking three apps ago. This one I talk to
                  while walking out of the shop.&rdquo;
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <Avatar initials="MN" color="#B5442F" />
                  <div>
                    <p className="text-sm font-semibold text-ink">Meera N.</p>
                    <p className="text-xs text-ink-muted">
                      Pune · family of four
                    </p>
                  </div>
                </figcaption>
              </Card>
            </figure>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- security */}
      <section id="security" className="border-y border-line-soft bg-paper-sunken">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <Eyebrow>Security</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-medium text-ink sm:text-[38px]">
                Nothing is saved until you say so
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">
                Every parsed entry waits in a review queue with a plain-language
                confidence read. We never ask for net-banking credentials,
                integrations are opt-in with one toggle each, and you can export
                or delete everything at any time.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "No bank credentials, ever",
                  "ExpenseIQ has no net-banking login and never will. Nothing here can move your money.",
                ],
                [
                  "Read-only integrations",
                  "Where an inbox or calendar is connected, it is read-only and opt-in — and raw email is never stored.",
                ],
                [
                  "Ten seconds to undo",
                  "Confirmed something too fast? Undo restores it exactly, including the account balance.",
                ],
                [
                  "Export or delete anytime",
                  "Your ledger leaves as CSV whenever you want it, and deleting a profile shows exactly what goes with it.",
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

      {/* --------------------------------------------------------- pricing */}
      <section id="pricing" className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-medium text-ink sm:text-[38px]">
              Free for one person. ₹99 for the household.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
              Paid plans aren&rsquo;t live yet — every plan starts as a free
              account, and nothing asks for a card.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.highlight
                    ? "relative flex flex-col border-green p-6 shadow-[var(--shadow-popover)]"
                    : "relative flex flex-col p-6"
                }
              >
                {plan.highlight && (
                  <span className="absolute -top-2.5 left-6 rounded-full bg-green px-2.5 py-0.5 text-[11px] font-semibold text-paper">
                    {plan.highlight}
                  </span>
                )}

                <h3 className="font-display text-xl font-medium text-ink">
                  {plan.name}
                </h3>

                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-display text-[40px] font-medium leading-none text-ink">
                    {plan.price}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {plan.cadence}
                  </span>
                </div>

                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature.label}
                      className="flex flex-wrap items-center gap-2 text-sm text-ink-soft"
                    >
                      <Check
                        className="size-4 shrink-0 text-green"
                        aria-hidden="true"
                      />
                      {feature.label}
                      {feature.soon && <Pill tone="soon">Soon</Pill>}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={plan.highlight ? "primary" : "secondary"}
                  className="mt-7 h-11 w-full"
                >
                  <Link href="/signup">{plan.cta}</Link>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className="border-t border-line-soft bg-paper-sunken">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center sm:px-8 sm:py-20">
          <h2 className="font-display text-3xl font-medium leading-tight text-ink sm:text-[42px]">
            Your first entry takes four seconds.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-ink-muted">
            Free for personal use. Create an account, add one card, and say what
            you spent.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild className="h-12 px-7 text-base">
              <Link href="/signup">Start free</Link>
            </Button>
            <Button asChild variant="secondary" className="h-12 px-7 text-base">
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
