# ExpenseIQ

An AI-powered expense tracker built around one idea: **nothing an AI parses
reaches your ledger without you confirming it.**

Type or speak an expense in Hindi, Gujarati, English or the code-mixed mess
people actually use — *"petrol bharwaya 1200"*, *"300 रुपये किराने पे खर्च
किए"* — and it lands in a review queue first, parsed into amount, category,
merchant and date, for you to confirm or correct.

## Why it exists

Most expense trackers make you fill a form. The ones that don't tend to write
straight into your ledger and quietly corrupt it when the parse is wrong. This
one treats the review queue as the product's central trust mechanism rather
than an afterthought.

## Repository layout

```
server/                            NestJS + PostgreSQL API
ExpenseIQ Design System/           the full visual design — screens, components, tokens
expenseiq-backend-architecture.md  module structure, data model, API surface
expenseiq-feature-specification.md per-feature flows, edge cases, acceptance criteria
expense-tracker-roadmap (1).md     phased build plan
```

Start with [`server/README.md`](server/README.md) — setup, architecture and the
decisions worth knowing.

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Foundation — scaffold, data model, money handling, tooling | ✅ |
| 1 | Identity & access — auth, profiles, RBAC | ✅ |
| 2 | Money core — accounts, transactions, card & loan math | ✅ |
| 3 | Insights — dashboard, budgets, spend norms | ✅ |
| 4 | NLU & review queue — multilingual parsing, confidence, corrections | ✅ |
| 5 | Ingestion — receipts, recurring detection | ✅ |
| 6 | Reminders & notifications | ✅ |
| 6b | Google integrations — Gmail, Calendar, Tasks | — (needs OAuth credentials) |
| 7 | Family — invites, roles, spend limits, allowances | — |
| 8 | Hardening | — |

## Notable design decisions

**The design system is treated as the API specification.** A gap analysis found
roughly twenty things the screens render that the architecture document never
modelled — loan amortization with prepay savings, budgets, per-category spend
norms, category→account affinity. Two of those gaps were structural: interactive
parsing has to be synchronous (the design shows interpretation appearing
mid-speech), and one utterance can yield several transactions.

**Money is integer paise in a `BigInt` column.** Never float, never `Decimal` —
the latter loses precision crossing a JSON boundary, which it does on every
response.

**Restrictions are enforced server-side.** A child profile that can't link a
credit card gets a 403 from the API, not merely a hidden button.

## Stack

TypeScript · NestJS · PostgreSQL · Prisma · Redis + BullMQ · Google Gemini
