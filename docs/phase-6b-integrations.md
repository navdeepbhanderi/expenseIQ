# Phase 6b — Integrations (Gmail, Calendar, Tasks)

**Status:** deferred, not started. Everything below is design and handoff, not
a description of existing code.

**Blocked on:** Gmail/Calendar/Tasks scopes on the Google OAuth consent screen.
Nothing here can be tested end-to-end until those are added, which is why the
phase was deferred rather than half-built.

Phase 6 shipped in two halves. Reminders and notifications are **done and
tested**. This document covers the half that wasn't built.

---

## 1. What already exists

Don't rebuild these — the groundwork landed in earlier phases.

| Piece | Where | State |
|---|---|---|
| `Integration` model | `server/prisma/schema.prisma:665` | Migrated. `profileId`, `type`, `enabled`, `oauthTokenRef`, `scopes[]`, `lastSyncedAt`, `syncCursor`, `connectedAt`, unique on `[profileId, type]` |
| `IntegrationType` enum | `schema.prisma:685` | `GMAIL`, `GOOGLE_CALENDAR`, `GOOGLE_TASKS`, `SMS` |
| CHILD restriction | `src/modules/access/domain/permissions.ts:42` | `integration:enable` / `integration:disable` already denied to CHILD, with the reasoning comment at line 109 |
| Google OAuth login | `src/modules/auth/` | Working. **Login only** — a different grant from the data scopes this phase needs |
| Queue port | `src/infra/queue/queue.port.ts` | `QUEUES` needs a `gmailSync` entry; `bull` and `inline` drivers both exist |
| Review queue | `src/modules/review-queue/` | The destination for everything this phase ingests |
| `TransactionSource` | `schema.prisma` | Already has the source values ingestion needs |

The `oauthTokenRef` field name is deliberate and predates this phase: it holds
a **reference into secret storage, never a raw token**. Honour that.

---

## 2. Endpoints to build

From the approved plan:

```
GET    /profiles/:pid/integrations
POST   /profiles/:pid/integrations/:type/connect     -> { authUrl }
GET    /integrations/:type/callback                  -> OAuth redirect target
DELETE /profiles/:pid/integrations/:type             -> disconnect + revoke
POST   /profiles/:pid/integrations/gmail/sync        -> manual trigger
POST   /webhooks/gmail                               -> signature-verified, no JWT
```

`GET /profiles/:pid/integrations` should return every type — including ones
never connected — so the UI can render the full list of toggles without
knowing the enum. Shape: `{ type, enabled, connectedAt, lastSyncedAt, scopes }`.
Never return `oauthTokenRef`.

---

## 3. Decisions already made — don't relitigate

These came out of the architecture doc and the phase plan. They exist because
each one has a failure mode attached.

**Poll before webhooks.** Gmail push requires a Cloud Pub/Sub topic and a
verified domain. Polling needs neither and is strictly simpler to test. Build
polling first; `POST /webhooks/gmail` can land later without reshaping
anything, because both paths converge on the same sync routine.

**Opt-in, off by default.** `Integration.enabled` defaults to `false` in the
schema. Reading someone's mail is not a sensible default.

**Re-check `enabled` mid-batch, not just at job start.** A user who disconnects
Gmail during a long sync has withdrawn consent *now*, not at the next job. Load
the integration row again inside the per-message loop.

**Never persist raw email bodies.** Extract, enqueue the candidate, discard the
body. What lands in the database is a transaction candidate, not correspondence.
This is the single most important constraint in the phase.

**Idempotency at the DB, not in app logic.** Follow the pattern already proven
in `src/modules/recurring/recurrence-generator.service.ts:101` — build a
deterministic `sourceRefId` and let the partial unique index on
`(source, sourceRefId)` reject the duplicate. For Gmail the natural key is the
message ID. A sync that runs twice must produce one review item, and the
guarantee should survive a process crash between "read" and "write", which
only a DB constraint gives you.

**Ingested entries land in the review queue, never straight in the ledger.**
Same rule the receipt and recurring paths follow.

---

## 4. Token handling

The riskiest part of the phase, and the reason it isn't a quick win.

- Login-with-Google and read-my-Gmail are **separate consent grants**. Do not
  try to widen the existing login scope — a user signing in should not be
  asked for mailbox access.
- Store the refresh token behind `oauthTokenRef`. Encryption at rest for this
  field is a Phase 8 hardening item and the two should be done together.
- Handle revocation: Google returns `invalid_grant` once a user revokes access
  from their account settings. That must flip `enabled` to `false` and surface
  a notification — the notifications module is already built for this.
- Scope changes need re-consent. Record granted scopes in `scopes[]` and
  compare before assuming a capability is available.

---

## 5. Testing

The pattern is established: `LlmPort` and `QueuePort` each have a fake driver
so integration tests need no network. **Do the same for Google APIs** — a
`GoogleApiPort` with a fake driver returning canned messages. No test in this
suite should make a live Google call, for the same reason the mailer now
suppresses sends under test.

Cases that matter most:
1. Same message synced twice produces one review item (crash-safe idempotency)
2. Disconnecting mid-batch stops ingestion on the next message
3. `invalid_grant` disables the integration and notifies
4. A CHILD profile calling connect gets 403 — the permission is already
   defined, so this is a wiring test
5. No email body is present anywhere in the database after a sync

---

## 6. Suggested order

1. `GoogleApiPort` + fake driver, with tests. Nothing else is testable first.
2. `integrations` module: list / connect / callback / disconnect.
3. Token storage and the revocation path.
4. Gmail polling sync → review queue, with `sourceRefId` idempotency.
5. Calendar and Tasks — much smaller, they write rather than read.
6. `POST /webhooks/gmail` last, once polling is proven.

---

## 7. Prerequisite for the user

Add these to the OAuth consent screen before starting:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/tasks`

Gmail read access makes the app subject to Google's restricted-scope
verification if it ever goes public. Fine for local development with the
account listed as a test user; worth knowing before it becomes a surprise.
