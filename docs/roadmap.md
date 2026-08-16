# ExpenseIQ — roadmap

## Where this stands

Updated 16 August 2026. Branch `feat/parsing-accuracy-and-schedule-limits`.

**Shipped since this file was written**, none of it originally planned — each
one found by using the product rather than reading it:

- Balances now follow the ledger. `transactions.service` never touched
  `balanceMinor`, so every balance was the number typed at account creation.
  Two ₹5,000 purchases left a card reading ₹0 outstanding. One sign rule now,
  in `transactions/domain/balance-effect.ts`, applied by every path that
  writes a transaction — including the review queue's confirm, which writes
  its own row and is how nearly every expense actually arrives.
- Transfers. Paying a card is a linked pair excluded from nine spend
  aggregates; without that, clearing a ₹5,200 bill added ₹5,200 to the month
  and fired a spend-limit nudge, every month, for doing the right thing.
- Phase A's backend — see below.
- The dev database was reset (it had drifted enough to block `migrate dev`),
  which also stopped the flaky `Family (e2e)` reproducing.

**Verified:** 377 server unit · 240 e2e · 80 web · lint and build clean.

Written after a QA pass that found the same shape of bug repeatedly: a model
that knows something the product never acts on. The card knew its statement
day but had no statement; the ledger knew every transaction but never moved a
balance; `autoDebit` was stored and read by nothing. Each phase below closes
one of those gaps rather than adding a surface.

Phases are ordered so that each one is shippable on its own and none depends
on a later one. Where a phase is a prerequisite for others it says so.

---

## Phase A — Credit cards that behave like credit cards

**Backend: done** (`e880740`). **UI: not started.** This is the only phase
partially delivered, and the remaining piece is small and self-contained.

### What shipped

`CardStatement` snapshots the bill — amount, minimum and due date, frozen when
cut. Snapshotting rather than deriving on read is the point: a statement is a
historical fact, so recomputing it from current transactions would make last
month's bill change whenever an old entry was edited, and would let a reminder
quote a figure that had already moved by the time the email landed.

The nightly scheduler generates them, *before* the reminder scan so a card
whose statement day is today is not reminded about last month's, and ages an
unpaid statement past its due date to `OVERDUE` — so overdue finally means
money is owed rather than that a date went by. Unpaid balances carry forward.
Payments settle the oldest open statement first, because that is the one
overdue or about to be, and paying it is what stops the interest.

Idempotent on `(accountId, statementDate)`; a nightly job that double-billed
would be worse than one that never ran.

### What remains — the card panel

`GET /profiles/:id/accounts/:accountId` already returns everything needed:

```
card.statement.billed   -- null when nothing is owed
  { statementDate, dueDate, amount, minimumDue, paid, dueNow, isOverdue }
card.statement.unbilled -- spent since the last statement; next cycle's
```

The panel currently reads `card.outstanding` and `card.cycle` and cannot tell
the two apart. It needs to:

1. Lead with `billed.dueNow` and `billed.dueDate` when a bill is open —
   *"₹5,000 due by 5 Sept"*.
2. Show `unbilled` as information, not a demand — *"₹1,200 spent since, bills
   15 Sept"*. This is the sentence the product could not say before.
3. Show `paid` when a part payment has been made; paying the minimum and
   paying in full are the difference between free credit and 42% interest, so
   they must not look the same.
4. Default the pay modal's amount to `dueNow`, not `outstanding` — today it
   offers to pay for the coffee bought that morning.
5. Use red only for `billed.isOverdue`. The current date-based check is
   already gated on owing something, but that is a patch over the real rule.
6. When `billed` is null: no demand at all, just the cycle and what has been
   spent so far.

**Loans.** The equivalent half-exists — `emisPaid` and the amortisation
schedule. Bringing them to the same standard is the rest of this phase; a due
EMI is a statement in all but name.

---

## Phase B — Money that moves between your own accounts

Phase A's payment machinery generalised. All of these are today either
impossible or recorded as spending, which double-counts.

1. **Transfers** — bank→bank, bank→cash, salary sweep. The transfer pair from
   the card payment already does this; it needs a UI and a picker.
2. **ATM withdrawals** — a transfer from bank to cash, *not* spending. Today
   it double-counts against everything later bought with that cash.
3. **Refunds** — linked to the original transaction so the category total
   corrects itself, rather than a CREDIT that inflates income.
4. **Split a transaction** — ₹4,000 at D-Mart is groceries *and* household.
   One category today, so either a norm is wrong or three fake rows exist.
5. **Settle up** — "Meera paid for dinner, I owe her ₹600." Members,
   allowances and goals exist; the thing every household actually runs on does
   not.

**Prerequisite:** none beyond what shipped with card payments.

---

## Phase C — Error and empty states

**The problem.** Ten of twelve app pages do not distinguish a failed request
from an empty one. With the API down, Transactions renders "Nothing matches",
Accounts renders "no accounts yet". It reads as *your data is gone*, it is
silent, and there is no retry — the only recovery is a refresh the user has no
reason to expect will help.

Dashboard and account-detail already do this properly. This phase is largely
copying that pattern, plus:

- `isPending` currently conflates "loading" with "no profile selected", so
  some pages skeleton forever when `activeId` is null.
- Skeletons that do not match what renders (Recurring shows two columns, then
  renders one — the layout jumps).
- Reports has no empty state; a new user sees axes and no explanation.
- Mutation failures are toast-only. The toast vanishes, the form keeps the
  values, and nothing on screen says anything went wrong.

**Small, mechanical, high value.** Do it in one pass.

---

## Phase D — The things that silently truncate or do nothing

1. **Pagination** exists on Transactions alone. Notifications, Accounts,
   Recurring and Categories render page one and stop, with no indication.
2. **Search is a link.** The top bar's "Search transactions" is
   `href="/transactions"` with no query, so typing does nothing.
3. **No unsaved-changes guard anywhere.** Closing a form discards everything
   without a word.
4. **No optimistic UI.** Every toggle waits a full round trip and visibly lags.
5. **Per-item dismiss on notifications** — `POST /:id/read` exists, only
   "mark all" is wired.

---

## Phase E — What the data already knows

Features that need no new integration, only a query and a screen.

1. **Statement reconciliation** — the statement says ₹23,480, we hold ₹22,900,
   so three entries are probably missing. Hard by hand, nearly free here.
   *Needs Phase A.*
2. **Recurring from a transaction** — patterns are detected from history, but
   a rent payment cannot be pointed at and marked as repeating. One button.
3. **Minimum-due warning** — `minDuePercent` is stored and the minimum is
   computed, but paying the minimum and paying in full are indistinguishable.
   That difference is free credit versus 42% interest. *Needs Phase A.*
4. **Year-end summary** — twelve months of categorised data, and FY reporting
   is already promised as "Soon" on the landing page.

---

## Phase F — Parsing accuracy, round two

The date, amount and name resolvers moved into code and are tested. What
remains:

1. **Multi-expense sentences skip date resolution** when two different dates
   are named. Attributing each to the right clause needs real parsing; today
   it stands down and lets the model answer.
2. **Learned aliases are half-built.** Merchant→category affinity is derived
   from confirmed history. The stronger signal — what the user *corrected* —
   is recorded as `Correction` rows that store the field but not the spoken
   word, so they cannot yet teach anything.
3. **Receipts have no UI.** `POST/GET/GET :id` all exist and nothing calls
   them. Needs a vision model, so it pairs with bring-your-own-key.
4. **Voice dies on Firefox.** The mic uses the browser Web Speech API;
   `POST /nlu/parse/audio` exists as the server-side fallback and is never
   called, so the button is simply disabled.

---

## Phase G — Housekeeping

1. **Intermittent e2e failure** in `Family (e2e)` — savings goals and family
   dashboard. Has not reproduced across several full runs since the test
   database was reset, which is the likely explanation: accumulated state, the
   same drift that had blocked `migrate dev`. Recorded as *not reproducing*
   rather than fixed, because no root cause was found. If it returns, the
   suspicion is cross-suite leakage rather than anything in those tests —
   both pass 4/4 in isolation.
2. **Rotate the exposed credentials** — Google client secret, Resend,
   OpenRouter and Groq keys have all passed through a chat transcript.
3. **Visual QA.** Almost all of the UI review above is code-level. Four or
   five screens have been looked at in a browser; layout, contrast, focus
   order and touch targets have not been checked on a real device, and several
   Phase C/D items would probably reorder after twenty minutes of using it on
   a phone.

4. **A backfill for balances, if any pre-reset data survives elsewhere.** Rows
   written before balances followed the ledger left account balances that do
   not reconcile with their transactions. The dev database was wiped rather
   than backfilled — a backfill would have had to guess which historical
   balances were already correct. Any other environment carrying old data
   needs `balanceMinor` recomputed from its ledger before its numbers mean
   anything.

---

## Suggested order

**A (finish the UI) → C → B → D → E → F**, with G threaded through.

Finishing A first because its data is live and unread, which is the exact
pattern this whole document exists to close: a model that knows something the
product never acts on. C next
because it is cheap and it is the difference between "the app is broken" and
"something failed, try again". B before D because it removes double-counting
from real numbers, where D is friction rather than incorrectness.
