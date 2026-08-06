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

**CSV export neutralises formulas.** A cell starting with `=`, `+`, `-` or `@`
executes when opened in Excel or Sheets. Merchant names and notes are user
input — and from Phase 4 will come from parsed emails — so an exported ledger
is a real injection vector.

## Status

Phases 0–2 complete: foundation, auth, profiles and RBAC, money core.
Phases 3–8 per the plan.

### Auth flow, locally

With no mail provider configured the verification link is written to the log,
so the whole signup flow works offline:

```bash
curl -X POST localhost:3100/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Kirana@2026","displayName":"Aarav"}'
# then grep the server output for the verify-email link
```
