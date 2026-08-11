# ExpenseIQ — roadmap

Written after a QA pass that found the same shape of bug repeatedly: a model
that knows something the product never acts on. The card knew its statement
day but had no statement; the ledger knew every transaction but never moved a
balance; `autoDebit` was stored and read by nothing. Each phase below closes
one of those gaps rather than adding a surface.

Phases are ordered so that each one is shippable on its own and none depends
on a later one. Where a phase is a prerequisite for others it says so.

---

## Phase A — Credit cards that behave like credit cards

**The problem.** The product has a billing *cycle* — two dates recomputed from
`statementDay` and `dueDay` — and one number, `balanceMinor`. A real card has
two numbers that mean different things:

| | What it is | Behaviour |
|---|---|---|
| Statement balance | ₹5,000 billed on 15 Aug | Frozen at statement time, due 5 Sep |
| Current outstanding | Everything unpaid, incl. today's coffee | Moves constantly, not yet due |

Conflating them means "Clear this bill" pays the purchase made this morning,
which is not due for seven weeks. It also means the app cannot say the one
sentence a cardholder actually wants: *"₹5,000 due by 5 Sep; the ₹1,200 since
is next month's."*

**The missing noun is a statement.**

```
CardStatement
  accountId · statementDate · dueDate
  amountMinor       -- snapshot: cycle spend + unpaid carry-over
  minimumDueMinor   -- snapshot, not recomputed later
  paidMinor         -- payments applied against this statement
  status            -- OPEN | PAID | OVERDUE
```

**Work**

1. Model + migration.
2. A generator in the nightly scheduler: on the statement day, snapshot the
   cycle's spend plus any unpaid carry-over, compute the minimum, open it.
3. Payments apply against the oldest open statement rather than the running
   balance. Partial payments accumulate in `paidMinor`.
4. Card panel reworked around the distinction — *due now* from the open
   statement, *unbilled so far* as information rather than a demand.
5. Overdue becomes "an unpaid statement past its due date", not "a date has
   passed". (The display half of this is already fixed; the meaning is not.)
6. Reminders quote the statement amount, which cannot drift after the email
   is sent — today they quote a live balance that can.

**Why first.** Every other card feature — interest, minimum-due warnings,
reconciliation — needs a statement to hang off. It is also the only phase here
that fixes something actively misleading.

**Loans.** The equivalent already half-exists: `emisPaid` and the amortisation
schedule. Bring it to the same standard — a due EMI is a statement in all but
name.

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
   dashboard, passing 4/4 in isolation, so cross-suite state leakage. A
   non-deterministic test is worse than a failing one; it trains you to re-run.
2. **Rotate the exposed credentials** — Google client secret, Resend,
   OpenRouter and Groq keys have all passed through a chat transcript.
3. **Visual QA.** Almost all of the UI review above is code-level. Layout,
   contrast, focus order and touch targets have not been checked on a real
   device, and several Phase C/D items would probably reorder after twenty
   minutes of using it on a phone.

---

## Suggested order

**A → C → B → D → E → F**, with G threaded through.

A first because it is the only phase fixing something actively wrong. C next
because it is cheap and it is the difference between "the app is broken" and
"something failed, try again". B before D because it removes double-counting
from real numbers, where D is friction rather than incorrectness.
