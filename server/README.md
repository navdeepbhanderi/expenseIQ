# ExpenseIQ — Backend

NestJS + PostgreSQL + Prisma. AI-powered expense tracker with multilingual
natural-language entry and a human-in-the-loop review queue.

Build plan and API design: `~/.claude/plans/zazzy-finding-feather.md`.

## Getting started

```bash
cp .env.example .env          # then generate the two JWT secrets
npm install
npm run db:up                 # Postgres (dev + test) and Redis in Docker
npm run db:migrate            # apply migrations
npm run db:seed               # system categories
npm run start:dev
```

API at `http://localhost:3100/api/v1`, OpenAPI docs at
`http://localhost:3100/api/docs`.

### Ports

Deliberately non-default, because 5432/5433/6379/3000 were all taken on the
original dev machine:

| Service | Port |
|---|---|
| API | 3100 |
| Postgres (dev) | 5435 |
| Postgres (test) | 5434 |
| Redis | 6380 |

## Testing & quality

```bash
npm run verify    # typecheck + lint + unit — run this before every commit
npm test          # unit — pure domain logic, no database
npm run test:e2e  # integration — real app against the test database
npm run lint:fix  # auto-fix lint and formatting
```

Unit tests live beside the code as `*.spec.ts`. Integration tests live in
`test/` as `*.e2e-spec.ts` and run against a **separate** Postgres container
with a tmpfs volume, so they can truncate freely and never touch dev data.
`global-setup.ts` refuses to run if `TEST_DATABASE_URL` equals `DATABASE_URL`.

## Layout

```
src/
  config/       env contract, validated at boot — a bad env kills the process
                rather than surfacing as a confusing 500 later
  common/
    money/      Money value object — integer paise, never float, never Decimal
    pagination/ cursor helpers (offset pagination is wrong for a live ledger)
    logger/     structured JSON logging, redaction at the logger boundary
    filters/    the single error envelope
    middleware/ correlation id
  infra/
    prisma/     one adapter per external system, all swappable
  modules/      one folder per bounded context
```

Modules with real business rules also get a `domain/` folder: pure functions,
no DB, no Nest decorators. That's where amortization, billing-cycle rollover
and confidence banding will live — the parts worth testing exhaustively.

## Decisions worth knowing

**Money is integer paise in a `BigInt` column.** Not `Decimal`, not float.
Prisma's `Decimal` loses precision crossing a JSON boundary, which it does on
every response. `src/common/money/money.ts` owns all arithmetic; amounts go
over the wire as `{ amountMinor, currency }`.

**Partial unique indexes back the nullable scopes.** Prisma's
`@@unique([profileId, name])` does *not* constrain rows where `profileId IS
NULL`, because Postgres never treats NULL as equal to NULL. System categories,
global merchants, overall budgets and overall spend limits were all silently
unconstrained. Migration `20260806195944` adds real partial indexes. They
can't be expressed in `schema.prisma`, so **preserve them through future
migrations.**

**`ProfileMember` replaces single-owner profiles.** A profile is personal with
one member, shared with several, restricted when its subject member is `CHILD`.
This is what lets the design's profile switcher move *into* a family profile
that owns its own transactions and review queue.

**`NluRequest` sits above `ReviewQueueItem`.** One utterance can yield several
transactions ("groceries 300, uber 640, and bijli ka bill 2400"), so the parent
holds the raw input and the per-request telemetry while the children hold the
candidates.

**Interactive NLU is synchronous.** Queues are for ingestion (Gmail, receipts,
reminders) only — never for a user waiting on screen. The design shows parse
results appearing mid-speech, which a queue round-trip cannot deliver.

**Two tsconfigs, deliberately.** `tsconfig.json` is broad so typecheck and
type-aware lint cover tests and the seed script. `tsconfig.build.json` narrows
to `src/` — including `prisma/` and `test/` in the emitted program widens the
inferred `rootDir` and the output silently moves to `dist/src/main.js`.

**Lint is type-aware.** `no-floating-promises` and `no-misused-promises`
require the type checker and map to real failure modes here: a forgotten
`await` on a Prisma write loses data silently.

**One `configureApp()`, used by both entry points.** `src/bootstrap.ts` owns
the HTTP pipeline; `main.ts` and the test harness both call it. Not tidiness —
when the two drift, tests stop describing production. It bit once already:
`cookieParser()` lived only in `main.ts`, so every cookie-based refresh
silently 401'd under test while working fine in the real app.

**Authentication is global and opt-out.** `JwtAuthGuard` is an `APP_GUARD`;
routes opt out with `@Public()`. A route that forgets its decorator is locked,
not exposed.

**Refresh tokens are opaque, not JWTs.** A JWT can't be revoked, and revocation
is the whole mechanism behind reuse detection. Refresh tokens are 256-bit
random strings stored as SHA-256 hashes, with the database as the source of
truth — which buys real logout and real family revocation. Replaying a spent
token revokes the entire family descended from that login.

**The access guard answers 404, never 403.** A 403 on someone else's profile
confirms it exists, which lets anyone enumerate profile ids by watching status
codes. Inaccessible and nonexistent must look identical from outside.

**Derived values are computed on read, never stored.** Statement dates, credit
utilisation and the amortisation position are pure functions of the account's
terms and today's date. Persisting them would mean every one going stale at
midnight with no write to trigger a refresh.

**Dependency pins live in `overrides`.** `js-yaml` is pinned to `^5.2.3` under
`@nestjs/swagger` — the advisory affects 5.0.0–5.2.1, and npm's suggested fix
was to *downgrade* swagger. A scoped override patches within the same major
without touching anything else. Re-check with `npm audit --omit=dev`.

**Prisma config is `prisma.config.ts`, not `package.json#prisma`.** The old
block is removed in Prisma 7. The config file loads before anything populates
`process.env`, so it imports `dotenv/config` explicitly — without that,
`DATABASE_URL` is undefined and every migrate command fails confusingly.

**Background work is behind a port, like the LLM.** `QUEUE_DRIVER=inline`
runs jobs in-process; anything else uses BullMQ on Redis. Tests use inline,
because a test that enqueues work and polls for a worker is slow, flaky, and
ends up testing BullMQ rather than this application.

**Reminders key on the billing cycle, not the calendar day.** The spec's edge
case — "if reminder settings change after a reminder for that cycle already
fired, don't re-fire" — is unsolvable with a "is today the day?" scan, which
also sends nothing at all if it misses its window during a restart. Keying on
the due date fixes both: at most one send per cycle, and a late scan still
catches up. `lastFiredCycle` is written *after* delivery, because a duplicate
notification is a far smaller failure than a missed bill.

**"9 am" means 9 am where the user is.** `timeOfDay` is minutes past *local*
midnight, resolved through `Intl` rather than a hardcoded offset — 9 am UTC
would arrive at 2:30 pm in India. Tested against daylight saving too, even
though India has none.

**Detection proposes, the user disposes.** A detected recurring payment is
never auto-created as a rule. A pattern that silently started generating
transactions would put rows in the ledger the user never entered — the same
thing the review queue exists to prevent for parsed input.

**Amount variance does not disqualify a recurrence.** An electricity bill is
obviously recurring and is a different number every month. Cadence is decided
by the dates; amount stability is reported alongside as metadata.

**CSV export neutralises formulas.** A cell starting with `=`, `+`, `-` or `@`
executes when opened in Excel or Sheets. Merchant names and notes are user
input — and from Phase 4 will come from parsed emails — so an exported ledger
is a real injection vector.

## Status

Phases 0–6 complete: foundation, auth, profiles and RBAC, money core,
insights, natural-language entry and the review queue, receipt scanning and
recurrence detection, reminders and notifications.

**Phase 6 is partial**: reminders and in-app notifications are done; the
Google integrations (Gmail parsing, Calendar, Tasks) are not started and need
OAuth credentials — `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are still
blank. Phases 7–8 per the plan.

### Gemini setup

```bash
npm run llm:check     # verifies the key, both model tiers, and reports latency
```

Two things measured on a real free-tier key, both of which will bite:

- **`gemini-2.5-pro` has a free-tier quota of zero.** It returns 429 with
  `limit: 0` on every call. `GEMINI_MODEL_PRO` therefore defaults to
  `gemini-2.5-flash`; point it at Pro once billing is enabled.
- **The free tier allows ~20 requests per day**, which is not enough to
  develop against. Enable billing, or use `LLM_DRIVER=fake`.

`GEMINI_THINKING_BUDGET` defaults to `0`. Gemini 2.5 spends "thinking" tokens
before answering, billed as output and counted against `maxOutputTokens`.
Measured on the hardest extraction case here: 610 thinking tokens and 2.1
extra seconds for an *identical* result, against a design that budgets about
four seconds for the whole speak-to-confirmed flow. The same trap silently
broke merchant normalisation — 29 thinking tokens against a 32-token ceiling
returned an empty string with a 200 response.

### Voice input: transcript first, audio as fallback

Measured against real Gemini, not assumed:

| Path | Accuracy | Latency |
|---|---|---|
| Browser transcript → `POST /nlu/parse` | 2/2 | **2.2–2.6s** |
| Audio → `POST /nlu/parse/audio` | 3/3 | 4.7–5.1s |

Both are accurate — Gemini reconstructs `"teen so rupee kirana pay kharch
kiya"` as ₹300 Groceries without difficulty, which was the exact failure mode
that made the audio path look necessary. So the default is the browser
transcript: twice as fast, a fraction of the cost, and the Web Speech API
supplies the live on-screen text design `5b` needs anyway. Send audio when the
browser returns *no* transcript, which is its real failure mode on Gujarati
and heavy code-mixing.

### Running without a Gemini key

`LLM_DRIVER=fake` selects a deterministic stand-in adapter that genuinely
parses a useful subset of input — Hindi, Gujarati, Hinglish, Indian scale
words, multi-expense sentences. It's what the integration tests use, so the
whole pipeline is exercised with no network call and no bill, and it makes the
feature developable before anyone has a key. The default falls back to it when
`GEMINI_API_KEY` is unset.

### Auth flow, locally

With no mail provider configured the verification link is written to the log,
so the whole signup flow works offline:

```bash
curl -X POST localhost:3100/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Kirana@2026","displayName":"Aarav"}'
# then grep the server output for the verify-email link
```
