import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
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
  Sparkles,
  Split,
  Users,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/feedback";
import { ParseDemo } from "@/components/marketing/parse-demo";

export const metadata: Metadata = {
  title: "ExpenseIQ — Just say what you spent",
  description:
    "Speak an expense in Hindi, Gujarati or Hinglish and ExpenseIQ turns it into a proper ledger entry — categorised, tied to the right account, and always shown to you before it's saved.",
};

/*
 * Landing page — design 8a (web) and 8b (mobile).
 *
 * Two structural things the design does that are easy to miss and change the
 * whole feel:
 *
 *   1. The features band and the closing CTA are DARK in both themes. They are
 *      a compositional device — an ink band breaking up warm paper — not a
 *      theme response. Hence literal Night Ledger colours rather than tokens.
 *   2. The hero sits on sunken paper, not paper, so the demo card floats
 *      *above* its surroundings rather than merging with them.
 *
 * Claims: anything the API cannot do yet carries a `Soon` pill. Two further
 * claims were corrected rather than tagged — see the trust row and the badge.
 */

const FEATURES = [
  {
    icon: Mic,
    title: "Speak it in your language",
    body: "Hindi, Gujarati, Hinglish — or all of them in one sentence.",
  },
  {
    icon: Layers,
    title: "One sentence, several expenses",
    body: "“groceries 300, uber 640, bijli ka bill 2400” becomes three entries.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing enters unconfirmed",
    body: "A review queue with plain-language confidence on every entry.",
  },
  {
    icon: CreditCard,
    title: "Cards and loans, done properly",
    body: "Statement dates, minimum due, utilisation, EMI schedules, prepay maths.",
  },
  {
    icon: PiggyBank,
    title: "Budgets that know your habits",
    body: "“74% of your usual ₹25,000 on groceries” — context, not a bare number.",
  },
  {
    icon: Users,
    title: "Family without surveillance",
    body: "Shared profiles, kid limits, allowances. Limits nudge, never block.",
  },
  {
    icon: Receipt,
    title: "Scan the bill",
    body: "Photograph a receipt or drop a PDF; it lands in the same queue.",
  },
  {
    icon: RefreshCw,
    title: "Recurring, noticed for you",
    body: "Rent, EMIs and subscriptions detected from your own history.",
  },
];

/** `soon` means the API genuinely cannot do this yet. */
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
    body: "CSV today; Excel and an FY PDF your CA will accept are coming.",
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
    cadence: null,
    note: "forever, one profile",
    cta: "Start free",
    featured: false,
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
    cadence: "/month",
    note: "up to 6 profiles",
    badge: "Most chosen",
    cta: "Start free",
    featured: true,
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
    cadence: "/month",
    note: "freelancers & small business",
    cta: "Start free",
    featured: false,
    features: [
      { label: "Everything in Family" },
      { label: "Business vs personal ledgers", soon: true },
      { label: "GST-tagged expenses", soon: true },
      { label: "Financial-year reports for your CA", soon: true },
    ],
  },
];

/** Ink band. Fixed Night Ledger colours — a device, not a theme response. */
const DARK = "bg-[#17140F]";

export default function LandingPage() {
  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="border-b border-line-soft bg-paper-sunken">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-[88px]">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              {/*
               * Marigold, not green. The design uses attention here because
               * this is new news, and the whole palette reserves marigold for
               * the thing worth your eye.
               */}
              <span className="inline-flex items-center gap-2 rounded-full border border-attention-line bg-attention-soft px-[15px] py-[7px]">
                <span
                  aria-hidden="true"
                  className="size-[7px] rounded-full bg-attention"
                />
                <span className="text-[13px] font-semibold text-attention-ink">
                  Understands Hindi, Gujarati &amp; Hinglish
                </span>
              </span>

              <h1 className="mt-6 font-display text-[44px] font-normal leading-[1.02] text-ink sm:text-[60px] lg:text-[76px]">
                Just say what you spent.
              </h1>

              <p className="mt-5 max-w-[560px] text-[17px] leading-[1.6] text-ink-muted sm:text-xl">
                ExpenseIQ turns &ldquo;
                <span className="text-ink">300 रुपये किराने पे खर्च किए</span>
                &rdquo; into a proper ledger entry — categorised, tied to the
                right account, and always shown to you before it&rsquo;s saved.
              </p>

              <div className="mt-8 flex flex-col gap-3.5 sm:flex-row">
                <Button
                  asChild
                  className="h-auto rounded-[14px] px-[26px] py-4 text-base"
                >
                  <Link href="/signup">Start free — 2 minutes</Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  className="h-auto rounded-[14px] px-[26px] py-4 text-base"
                >
                  <Link href="#how">See how it reads</Link>
                </Button>
              </div>

              <ul className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted sm:gap-x-[22px]">
                {[
                  "No bank credentials",
                  "Your data is never sold",
                  "Free for personal use",
                ].map((item, i) => (
                  <li key={item} className="flex items-center gap-4">
                    {i > 0 && (
                      <span
                        aria-hidden="true"
                        className="hidden size-1 rounded-full bg-line sm:block"
                      />
                    )}
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
      <section id="how" className="border-b border-line-soft bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
            Three steps, four seconds
          </p>

          <ol className="mt-6 grid gap-5 md:grid-cols-3 lg:gap-6">
            {STEPS.map(({ step, title, body }) => (
              <li
                key={step}
                className="rounded-[18px] border border-line-strong bg-field p-6 sm:p-7"
              >
                <span className="font-display text-[32px] leading-none text-green">
                  {step}
                </span>
                <h3 className="mt-2.5 text-[19px] font-semibold text-ink">
                  {title}
                </h3>
                <p className="mt-2 text-[15px] leading-[1.6] text-ink-muted">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --------------------------------------------- features (dark band) */}
      <section id="features" className={DARK}>
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-[72px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#7B736A]">
            What it does
          </p>
          <h2 className="mt-3.5 font-display text-[34px] font-normal leading-[1.08] text-[#F5F0E8] sm:text-[52px]">
            Built for the money you actually have
          </h2>
          <p className="mt-3 max-w-[680px] text-[17px] leading-[1.6] text-[#9A9188] sm:text-lg">
            Credit card cycles, home loans, shared family spending, the
            subscription you forgot about. Not a spreadsheet with a nicer font.
          </p>

          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-[18px]">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-[18px] border border-[#2C2823] bg-[#1D1A17] p-6"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#5CBFA3]/12 text-[#5CBFA3]">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold text-[#F5F0E8]">
                  {title}
                </h3>
                <p className="mt-2 text-[15px] leading-[1.6] text-[#9A9188]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- extras */}
      <section className="border-b border-line-soft bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                And the rest of it
              </p>
              <h2 className="mt-3 font-display text-[30px] font-normal text-ink sm:text-[38px]">
                Everything else you&rsquo;d expect
              </h2>
            </div>
            <p className="flex items-center gap-2 text-[13px] text-ink-faint">
              Items marked <Pill tone="soon">Soon</Pill> are in development.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXTRAS.map(({ icon: Icon, title, body, soon }) => (
              <div
                key={title}
                className="flex gap-3.5 rounded-[18px] border border-line-strong bg-field p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-paper text-ink-muted">
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
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ families + quote */}
      <section id="families" className="border-b border-line-soft bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                Families
              </p>
              <h2 className="mt-3 font-display text-[30px] font-normal leading-tight text-ink sm:text-[38px]">
                One household, separate ledgers
              </h2>
              <p className="mt-4 text-[17px] leading-[1.6] text-ink-muted">
                A shared profile for the household, a personal one for you, and
                a limited one for each child. Everyone adds to the same picture
                without everyone seeing every line.
              </p>

              <ul className="mt-6 flex flex-col gap-2.5 text-[15px] text-ink-soft">
                {[
                  "Kid profiles see their own allowance and goals, not the family's card balances.",
                  "Spend limits nudge at 80% and flag the owner when crossed — they never block an entry.",
                  "Credit products are refused on a child profile by the server, not just hidden.",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-[9px] size-1 shrink-0 rounded-full bg-green"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <figure className="flex flex-col justify-center">
              <div className="rounded-[18px] border border-line-strong bg-paper p-6 sm:p-7">
                <blockquote className="font-display text-[22px] leading-[1.45] text-ink sm:text-[25px]">
                  &ldquo;I stopped tracking three apps ago. This one I talk to
                  while walking out of the shop.&rdquo;
                </blockquote>
                <figcaption className="mt-[18px] flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-[38px] items-center justify-center rounded-full bg-spend text-sm font-semibold text-paper"
                  >
                    MN
                  </span>
                  <div>
                    <p className="text-[15px] text-ink">Meera N.</p>
                    <p className="text-[13px] text-ink-faint">
                      Pune · family of four
                    </p>
                  </div>
                </figcaption>
              </div>
            </figure>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- security */}
      <section
        id="security"
        className="border-b border-line-soft bg-paper-sunken"
      >
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                Security
              </p>
              <h2 className="mt-3 font-display text-[30px] font-normal leading-tight text-ink sm:text-[38px]">
                Nothing is saved until you say so
              </h2>
              <p className="mt-4 text-[17px] leading-[1.6] text-ink-muted">
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
                  "Where an inbox or calendar is connected it is read-only and opt-in — raw email is never stored.",
                ],
                [
                  "Ten seconds to undo",
                  "Confirmed something too fast? Undo restores it exactly, including the account balance.",
                ],
                [
                  "Export or delete anytime",
                  "Your ledger leaves as CSV whenever you want, and deleting a profile shows what goes with it.",
                ],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-[18px] border border-line-strong bg-paper p-5"
                >
                  <h3 className="text-sm font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- pricing */}
      <section id="pricing" className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
            Pricing
          </p>
          <h2 className="mt-3 font-display text-[30px] font-normal leading-tight text-ink sm:text-[38px]">
            Free for one person. ₹99 for the household.
          </h2>
          <p className="mt-3 text-[15px] text-ink-muted">
            Paid plans aren&rsquo;t live yet — every plan starts as a free
            account, and nothing asks for a card.
          </p>

          <div className="mt-7 grid gap-[18px] lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={
                  plan.featured
                    ? "flex flex-col rounded-[18px] border border-green bg-paper p-6 shadow-[0_20px_44px_-28px_rgba(31,111,92,0.6)] sm:p-7"
                    : "flex flex-col rounded-[18px] border border-line-strong bg-field p-6 sm:p-7"
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[17px] font-semibold text-ink">
                    {plan.name}
                  </span>
                  {plan.badge && (
                    <span className="rounded-full border border-green/25 bg-green-soft px-2.5 py-1 text-[11px] text-green-hover">
                      {plan.badge}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-display text-[42px] leading-none text-ink">
                    {plan.price}
                  </span>
                  {plan.cadence && (
                    <span className="text-sm text-ink-faint">
                      {plan.cadence}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-ink-faint">{plan.note}</p>

                {/*
                 * Plain lines, no tick icons — the design lists them as text.
                 * A column of ticks reads as a comparison table and invites
                 * counting features rather than reading them.
                 */}
                <ul className="mt-[18px] flex flex-1 flex-col gap-2.5 text-[15px] text-ink-muted">
                  {plan.features.map((feature) => (
                    <li
                      key={feature.label}
                      className="flex flex-wrap items-center gap-2"
                    >
                      {feature.label}
                      {"soon" in feature && feature.soon && (
                        <Pill tone="soon">Soon</Pill>
                      )}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={plan.featured ? "primary" : "secondary"}
                  className="mt-[22px] h-12 w-full rounded-[13px] text-[15px]"
                >
                  <Link href="/signup">{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- closing (dark) */}
      <section className={DARK}>
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-14 sm:px-8 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-[32px] font-normal leading-tight text-[#F5F0E8] sm:text-[44px]">
              Your first entry takes four seconds.
            </h2>
            <p className="mt-2 text-[17px] text-[#9A9188]">
              Free for personal use. Family profiles from ₹99/month.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-3.5 sm:flex-row">
            <Button
              asChild
              className="h-auto rounded-[14px] px-[26px] py-4 text-base"
            >
              <Link href="/signup">Start free</Link>
            </Button>
            <Button
              asChild
              className="h-auto rounded-[14px] border border-[#35302A] bg-transparent px-[26px] py-4 text-base text-[#F5F0E8] hover:bg-[#1D1A17]"
            >
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
