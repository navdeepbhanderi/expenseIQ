# Phase 8 — Hardening audit

What was checked, what was found, and what was deliberately *not* changed.
Recorded so the negative results don't get re-derived later.

---

## 1. Security headers — **fixed**

No `helmet` at all before this phase. Added in `src/bootstrap.ts`, so it
covers the test harness and production identically.

`contentSecurityPolicy` is disabled on purpose: this process serves JSON, and
the only HTML surface is Swagger UI in development, which a default CSP breaks
(it needs inline scripts). Every header that protects an API client —
`nosniff`, frameguard, HSTS, referrer policy — is on, and `x-powered-by` is
gone. Asserted in `test/hardening.e2e-spec.ts`.

## 2. Request body limit — **fixed, plus a bug it exposed**

There was no explicit limit, leaving it at whatever the framework happened to
default to. The validation pipe only runs *after* the whole body is parsed
into memory, so a size limit is the only thing bounding an unauthenticated
request.

Two defects surfaced while testing it:

**`app.use(express.json({ limit }))` was dead code.** Nest registers its own
body parser during `create()`, so a parser added afterwards never sees an
unparsed body and silently does nothing — the framework default stayed in
force. Now uses `useBodyParser`, which reconfigures the parser that actually
runs. There is a test at 150kb (above the old 100kb default, below our 256kb)
specifically to catch this regressing back to dead config; asserting only the
2MB rejection would have passed either way.

**A legitimate 413 was being returned as a 500.** Express middleware throws
plain `Error`s carrying an HTTP status, which fell through the exception
filter's catch-all. The caller was told the server broke when their request
did, and every oversized body logged at error level as an unhandled fault.
`fromMiddleware()` in `http-exception.filter.ts` now maps 4xx-carrying
middleware errors; 5xx ones still get the catch-all's redaction.

## 3. Error envelope — **verified, no change**

Already consistent. `test/hardening.e2e-spec.ts` now pins it across all four
layers that can produce an error — router 404, guard 401, validation-pipe 400,
profile-guard 403 — plus the `requestId` a user can quote back.

## 4. Secret leakage — **verified, no change**

Tests now assert:
- no password hash in any auth response
- login reveals nothing about whether an address is registered (same status,
  same message either way — otherwise the login form is an account enumerator)
- no Prisma/Postgres internals or stack frames in error bodies

## 5. Encryption at rest — **no action needed, and this is the finding**

Every secret currently stored is **one-way hashed**, which is strictly stronger
than reversible encryption:

| Field | Treatment | Correct? |
|---|---|---|
| `User.passwordHash` | bcrypt | Yes — slow hashing is right for a user-chosen secret |
| `RefreshToken.tokenHash` | SHA-256 of 32 random bytes | Yes — reasoning at `token.service.ts:31`; bcrypt exists to slow brute force against guessable inputs, and 256 bits of entropy is not guessable |
| `EmailVerification.tokenHash` | SHA-256 | Yes, same reasoning |
| `Account.last4` | plaintext | Yes — last four digits are explicitly permitted in the clear |

The only field that will need *reversible* encryption is
`Integration.oauthTokenRef`, and it belongs to unbuilt Phase 6b. Building a
crypto layer now, with no consumer and no test against real usage, would be
speculative. It is listed as a prerequisite in `phase-6b-integrations.md`
instead.

## 6. Aggregate query performance — **measured, no change needed**

Inspection first: no N+1 anywhere in `dashboard`, `reports` or `budgets` —
every loop is in-memory aggregation over pre-fetched rows, and the dashboard
fans its independent queries out through `Promise.all`.

Then measured, because inspection is not evidence. Seeded 60,000 transactions
into the test database and ran `EXPLAIN (ANALYZE, BUFFERS)`:

| Query | Time | Plan |
|---|---|---|
| spend-by-category (groupBy) | 0.98 ms | Index Scan |
| 6-month trend scan | 2.76 ms | Bitmap Heap Scan |
| transaction list page 1 (cursor) | 0.045 ms | Index Scan |
| facet counts, unfiltered | 12.3 ms | **Seq Scan** |

The seq scan looked like a missing index. It was not — it was an artifact of
the synthetic data, where one profile owned 100% of the table, making a full
scan genuinely the cheapest plan.

Re-measured with a realistic distribution (600,000 rows, profile under test
owning 10%): the planner switches to a **Bitmap Heap Scan** and execution time
holds at **13.1 ms** despite a 10× larger table. It scales with the user's own
data, not the table's size, which is the property that matters.

**No index was added.** Adding one here would have been a fix for a problem
that only existed in the benchmark.

---

## Deliberately out of scope

- **Reversible encryption for OAuth tokens** — Phase 6b, see above.
- **CSP** — would need real work to keep Swagger UI functional, for a service
  that renders no user-facing HTML.
- **Unit-test coverage of `*.service.ts`** — reports ~0% under the unit config
  because services are covered by the 190-test e2e suite instead, against a
  real database. Chasing the number with mocked-Prisma unit tests would add
  tests that assert the mock, not the SQL. The `domain/` folders, which hold
  the logic worth unit-testing, are at 94–100%.
