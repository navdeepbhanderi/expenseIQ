# ExpenseIQ — Backend Architecture

## 1. High-Level Architecture

```
                                ┌─────────────────────┐
                                │   React Frontend     │
                                └──────────┬───────────┘
                                           │ HTTPS/REST
                                ┌──────────▼───────────┐
                                │   API Gateway Layer   │
                                │  (NestJS Controllers) │
                                └──────────┬───────────┘
                                           │
        ┌──────────────────┬──────────────┼──────────────┬──────────────────┐
        │                  │              │               │                  │
 ┌──────▼─────┐    ┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼───────┐  ┌───────▼──────┐
 │ Auth Module │    │ Core Domain  │ │ LLM/NLU    │ │ Integrations │  │ Notification │
 │             │    │ Modules      │ │ Module     │ │ Module       │  │ Module       │
 └──────┬─────┘    └───────┬──────┘ └─────┬──────┘ └──────┬───────┘  └───────┬──────┘
        │                  │              │               │                  │
        └──────────────────┴──────────────┼───────────────┴──────────────────┘
                                           │
                                ┌──────────▼───────────┐
                                │   PostgreSQL (Prisma) │
                                └───────────────────────┘

                                ┌───────────────────────┐
                                │  Redis (BullMQ Queues) │
                                │  - email-parse-queue   │
                                │  - reminder-queue      │
                                │  - calendar-sync-queue │
                                └───────────────────────┘
```

**Core principle:** Modular monolith. Not microservices — you don't need that complexity for a portfolio project, and a well-structured monolith with clear module boundaries demonstrates the *same* architectural thinking without the operational overhead. You can talk about "how I'd split this into services later" in interviews, which is actually a better signal than over-engineering it upfront.

---

## 2. NestJS Module Structure

```
src/
├── main.ts
├── app.module.ts
│
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts
│   │   │   ├── google.strategy.ts
│   │   │   └── refresh-token.strategy.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── roles.guard.ts
│   │   └── dto/
│   │
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── dto/
│   │
│   ├── profiles/
│   │   ├── profiles.module.ts
│   │   ├── profiles.controller.ts
│   │   ├── profiles.service.ts
│   │   └── dto/
│   │
│   ├── families/                    # Phase 2 priority (per your latest direction)
│   │   ├── families.module.ts
│   │   ├── families.controller.ts
│   │   ├── families.service.ts
│   │   ├── family-invite.service.ts
│   │   └── dto/
│   │
│   ├── accounts/                    # bank/credit-card/loan accounts
│   │   ├── accounts.module.ts
│   │   ├── accounts.controller.ts
│   │   ├── accounts.service.ts
│   │   └── dto/
│   │
│   ├── transactions/
│   │   ├── transactions.module.ts
│   │   ├── transactions.controller.ts
│   │   ├── transactions.service.ts
│   │   └── dto/
│   │
│   ├── review-queue/
│   │   ├── review-queue.module.ts
│   │   ├── review-queue.controller.ts
│   │   ├── review-queue.service.ts
│   │   └── dto/
│   │
│   ├── nlu/                         # LLM extraction layer
│   │   ├── nlu.module.ts
│   │   ├── nlu.service.ts
│   │   ├── prompts/
│   │   │   └── expense-extraction.prompt.ts
│   │   ├── validators/
│   │   │   └── extraction-schema.validator.ts
│   │   └── cache/
│   │       └── merchant-normalization.cache.ts
│   │
│   ├── integrations/
│   │   ├── integrations.module.ts
│   │   ├── integrations.controller.ts     # enable/disable toggles
│   │   ├── integrations.service.ts
│   │   ├── gmail/
│   │   │   ├── gmail.service.ts
│   │   │   └── gmail-parser.processor.ts   # BullMQ worker
│   │   ├── calendar/
│   │   │   └── calendar.service.ts
│   │   ├── tasks/
│   │   │   └── google-tasks.service.ts
│   │   └── sms/
│   │       └── sms-parser.processor.ts     # Android-only, stretch
│   │
│   ├── reminders/
│   │   ├── reminders.module.ts
│   │   ├── reminders.service.ts
│   │   └── reminders.processor.ts          # BullMQ scheduled job
│   │
│   ├── dashboard/
│   │   ├── dashboard.module.ts
│   │   ├── dashboard.controller.ts
│   │   └── dashboard.service.ts            # aggregation queries
│   │
│   └── notifications/
│       ├── notifications.module.ts
│       ├── notifications.service.ts
│       ├── email.provider.ts
│       └── push.provider.ts
│
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── current-profile.decorator.ts
│   ├── guards/
│   │   └── profile-access.guard.ts         # RBAC enforcement
│   ├── interceptors/
│   │   └── logging.interceptor.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   └── pipes/
│       └── validation.pipe.ts
│
├── config/
│   ├── configuration.ts
│   └── validation.schema.ts                # env var validation on boot
│
└── prisma/
    ├── schema.prisma
    └── migrations/
```

---

## 3. RBAC & Multi-Tenancy Design (Family + Profiles)

This is the core architectural complexity of the project — worth designing carefully since it's your main differentiator.

### 3.1 Data Model Relationships

```
User ──┬── owns ──> Profile (personal)
       │
       └── belongs to ──> FamilyMember ──> Family
                              │
                              └── has role: OWNER | ADULT | CHILD

Family ──> has many ──> FamilyMember ──> links to ──> Profile
```

Key design decision: **a Profile is always owned by exactly one User, but can be *linked* into a Family with a role.** This keeps personal data ownership clean while allowing family-level visibility.

### 3.2 Permission Matrix

| Action | OWNER (parent/admin) | ADULT (spouse) | CHILD |
|---|---|---|---|
| View own profile | ✅ | ✅ | ✅ |
| View other family profiles | ✅ (full) | ✅ (summary only) | ❌ |
| Edit own transactions | ✅ | ✅ | ✅ (manual only) |
| Link credit card/loan | ✅ | ✅ | ❌ |
| Enable email/SMS parsing | ✅ | ✅ | ❌ |
| Set spend limits on CHILD profile | ✅ | ❌ | N/A |
| Invite family members | ✅ | ❌ | ❌ |
| View CHILD's transaction feed | ✅ | ✅ (read-only) | N/A |

### 3.3 Enforcement Pattern

Use a **guard + decorator** combo rather than scattering permission checks through services:

```typescript
// common/guards/profile-access.guard.ts
// Checks: does req.user have access to req.params.profileId,
// and does their role allow the requested action?

@UseGuards(JwtAuthGuard, ProfileAccessGuard)
@RequireRole(FamilyRole.OWNER)
@Patch('profiles/:profileId/spend-limits')
setSpendLimit(...) { }
```

This is a real interview talking point: **"I implemented declarative RBAC via guards + decorators instead of imperative if-checks scattered across services, so permission logic is centralized and testable."**

---

## 4. Detailed Database Schema (Prisma)

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String?
  googleId      String?  @unique
  emailVerified Boolean  @default(false)
  createdAt     DateTime @default(now())

  profiles      Profile[]
  familyMemberships FamilyMember[]
}

model Family {
  id          String   @id @default(uuid())
  name        String
  createdBy   String
  createdAt   DateTime @default(now())

  members     FamilyMember[]
}

model FamilyMember {
  id          String     @id @default(uuid())
  familyId    String
  userId      String
  profileId   String     @unique
  role        FamilyRole @default(ADULT)
  joinedAt    DateTime   @default(now())

  family      Family     @relation(fields: [familyId], references: [id])
  user        User       @relation(fields: [userId], references: [id])
  profile     Profile    @relation(fields: [profileId], references: [id])

  @@unique([familyId, userId])
}

enum FamilyRole {
  OWNER
  ADULT
  CHILD
}

model Profile {
  id          String   @id @default(uuid())
  userId      String
  name        String
  isDefault   Boolean  @default(false)
  isChild     Boolean  @default(false)
  createdAt   DateTime @default(now())

  user            User             @relation(fields: [userId], references: [id])
  accounts        Account[]
  transactions    Transaction[]
  reviewItems     ReviewQueueItem[]
  categories      Category[]
  integrations    Integration[]
  spendLimits     SpendLimit[]
  familyMembership FamilyMember?
}

model Account {
  id               String      @id @default(uuid())
  profileId        String
  type             AccountType
  name             String
  balance          Decimal     @default(0)
  creditLimit      Decimal?
  statementDate    Int?        // day of month, 1-31
  dueDate          Int?        // day of month, 1-31
  interestRate     Decimal?
  principal        Decimal?    // for loans
  emiAmount        Decimal?    // for loans
  tenureMonths     Int?        // for loans
  createdAt        DateTime    @default(now())

  profile          Profile     @relation(fields: [profileId], references: [id])
  transactions     Transaction[]
  reminders        Reminder[]
}

enum AccountType {
  BANK
  CREDIT_CARD
  LOAN
}

model Transaction {
  id          String            @id @default(uuid())
  profileId   String
  accountId   String?
  amount      Decimal
  categoryId  String?
  merchant    String?
  date        DateTime
  note        String?
  source      TransactionSource @default(MANUAL)
  createdAt   DateTime          @default(now())

  profile     Profile   @relation(fields: [profileId], references: [id])
  account     Account?  @relation(fields: [accountId], references: [id])
  category    Category? @relation(fields: [categoryId], references: [id])

  @@index([profileId, date])
}

enum TransactionSource {
  MANUAL
  NLU_TEXT
  NLU_VOICE
  EMAIL
  SMS
}

model ReviewQueueItem {
  id                String        @id @default(uuid())
  profileId         String
  rawInput          String
  parsedAmount      Decimal?
  parsedCategoryId  String?
  parsedMerchant    String?
  parsedDate        DateTime?
  confidenceScore   Float?
  status            ReviewStatus  @default(PENDING)
  source            TransactionSource
  sourceRefId       String?       // e.g. Gmail message ID, for idempotency
  createdAt         DateTime      @default(now())
  resolvedAt        DateTime?

  profile           Profile @relation(fields: [profileId], references: [id])

  @@unique([source, sourceRefId])  // idempotency constraint
}

enum ReviewStatus {
  PENDING
  CONFIRMED
  EDITED
  DISCARDED
}

model Category {
  id          String   @id @default(uuid())
  profileId   String?  // null = system default category
  name        String
  icon        String?

  profile       Profile?      @relation(fields: [profileId], references: [id])
  transactions  Transaction[]
}

model SpendLimit {
  id          String   @id @default(uuid())
  profileId   String   // the CHILD profile being limited
  categoryId  String?
  monthlyLimit Decimal
  setByUserId String   // OWNER who set it

  profile     Profile  @relation(fields: [profileId], references: [id])
}

model Reminder {
  id          String   @id @default(uuid())
  accountId   String
  offsetDays  Int      @default(3)
  channel     ReminderChannel @default(EMAIL)
  enabled     Boolean  @default(true)

  account     Account  @relation(fields: [accountId], references: [id])
}

enum ReminderChannel {
  EMAIL
  PUSH
  CALENDAR
}

model Integration {
  id            String   @id @default(uuid())
  profileId     String
  type          IntegrationType
  enabled       Boolean  @default(false)
  oauthTokenRef String?  // reference to secret storage, not raw token
  connectedAt   DateTime?

  profile       Profile  @relation(fields: [profileId], references: [id])

  @@unique([profileId, type])
}

enum IntegrationType {
  GMAIL
  GOOGLE_CALENDAR
  GOOGLE_TASKS
  SMS
}
```

**Note on secrets:** `oauthTokenRef` stores a reference/ID, not the raw token — actual tokens live in a secrets manager (or encrypted column with app-level encryption, minimum). Never store OAuth tokens in plaintext in your primary DB.

---

## 5. API Design (REST, resource-oriented)

```
Auth
  POST   /auth/signup
  POST   /auth/verify-email
  POST   /auth/login
  POST   /auth/google
  POST   /auth/refresh
  POST   /auth/logout

Profiles
  GET    /profiles
  POST   /profiles
  PATCH  /profiles/:id
  DELETE /profiles/:id

Families
  POST   /families                          # create family, becomes OWNER
  POST   /families/:id/invite                # invite by email
  POST   /families/invite/:token/accept
  GET    /families/:id/members
  PATCH  /families/:id/members/:memberId     # change role
  DELETE /families/:id/members/:memberId

Accounts
  GET    /profiles/:profileId/accounts
  POST   /profiles/:profileId/accounts
  PATCH  /accounts/:id
  DELETE /accounts/:id

Transactions
  GET    /profiles/:profileId/transactions?from=&to=&category=&accountId=
  POST   /profiles/:profileId/transactions
  PATCH  /transactions/:id
  DELETE /transactions/:id

NLU
  POST   /profiles/:profileId/nlu/parse      # text or voice-transcribed input
                                              # → creates ReviewQueueItem, returns it

Review Queue
  GET    /profiles/:profileId/review-queue?status=pending
  PATCH  /review-queue/:id/confirm
  PATCH  /review-queue/:id/edit
  PATCH  /review-queue/:id/discard

Spend Limits (family/child)
  GET    /profiles/:profileId/spend-limits
  PUT    /profiles/:profileId/spend-limits    # OWNER only

Integrations
  GET    /profiles/:profileId/integrations
  POST   /profiles/:profileId/integrations/:type/connect   # returns OAuth URL
  DELETE /profiles/:profileId/integrations/:type            # disconnect

Reminders
  GET    /accounts/:accountId/reminders
  PUT    /accounts/:accountId/reminders

Dashboard
  GET    /profiles/:profileId/dashboard/summary
  GET    /profiles/:profileId/dashboard/spend-by-category
  GET    /profiles/:profileId/dashboard/trend

Webhooks (external, no user JWT — verified via signature)
  POST   /webhooks/gmail/push-notification
```

---

## 6. Background Jobs (BullMQ + Redis)

| Queue | Trigger | Job |
|---|---|---|
| `nlu-extraction` | User submits text/voice input | Call LLM, validate JSON, write to ReviewQueueItem |
| `email-parse` | Gmail push notification webhook OR periodic poll (every 15 min) | Fetch new emails → filter transactional senders → queue NLU extraction per email → dedupe via `sourceRefId` |
| `reminder-check` | Daily cron (e.g., 8 AM) | Scan accounts for upcoming due dates within offset window → send email/push |
| `calendar-sync` | Account due date created/changed | Create/update Google Calendar event |
| `merchant-cache-refresh` | Weekly | Clean stale merchant normalization cache entries |

**Idempotency pattern for email-parse queue:**
```typescript
// Before processing, check unique constraint
const existing = await prisma.reviewQueueItem.findUnique({
  where: { source_sourceRefId: { source: 'EMAIL', sourceRefId: emailMessageId } }
});
if (existing) return; // already processed, skip
```

This directly maps to the DB `@@unique([source, sourceRefId])` constraint — enforced at the DB level, not just app logic, so it's safe even under concurrent job execution.

---

## 7. LLM/NLU Service Design

```typescript
// nlu.service.ts — simplified shape

async extractExpense(rawInput: string, profileId: string): Promise<ExtractionResult> {
  // 1. Check merchant cache for known normalization first (cost optimization)
  // 2. Build prompt with schema instructions (see prompts/expense-extraction.prompt.ts)
  // 3. Call Gemini with a responseSchema (constrained JSON, not prompt-coaxed)
  // 4. Validate response against JSON schema (validators/extraction-schema.validator.ts)
  // 5. If invalid → retry once with error feedback in prompt
  // 6. If still invalid → mark as low-confidence, flag for manual review
  // 7. Return structured result
}
```

**Provider:** Google Gemini, not Claude — see the amendment note at the end of
this section.

**Prompt design principle:** keep extraction and translation in a single LLM call (not two separate calls) — reduces latency and cost. The prompt instructs: detect language → translate internally → extract fields → return JSON only, no prose.

**Failure handling:** LLM calls can fail (timeout, malformed output, rate limit). Every extraction that fails validation still gets written to `ReviewQueueItem` with `confidenceScore: null` and status `PENDING`, with `rawInput` preserved — so the user can still manually complete it. **Never silently drop a user's input.**

---

### Amendment — LLM provider is Gemini, not Claude

This section was written against Claude. The build uses **Google Gemini Pro**
(`@google/genai`), which changes three things:

- **Structured output is constrained, not requested.** Gemini takes a
  `responseSchema` with `responseMimeType: application/json`, so the model
  cannot emit malformed JSON. Step 5's retry becomes a rare fallback rather
  than the primary mechanism — schema validation still runs, because
  constrained decoding prevents malformed output, not *wrong* output.
- **Receipts need no separate vision model.** Gemini reads JPG and PDF
  natively through the same interface, which removes a step from the
  receipt-ingestion design entirely.
- **Two-tier routing.** Pro for multilingual extraction and receipts; Flash
  for merchant normalisation and recurrence hints, which are high-volume and
  trivially structured. Model ids are pinned per task in config, never at the
  call site.

Access goes through an `LlmPort` interface in `infra/llm/` so the provider
stays one folder deep. See `~/.claude/plans/zazzy-finding-feather.md` Part 4.

---

## 8. Cross-Cutting Concerns

### 8.1 Validation
- DTOs with `class-validator` decorators on every endpoint
- Global `ValidationPipe` with `whitelist: true` (strips unexpected fields — basic security hygiene)

### 8.2 Error Handling
- Global exception filter → consistent error shape `{ statusCode, message, error }`
- Never leak stack traces or internal errors to client in production

### 8.3 Logging
- Structured JSON logging (not console.log) — request ID, user ID, latency per request
- Sensitive fields (tokens, passwords) redacted at the logger level, not per-call

### 8.4 Rate Limiting
- `@nestjs/throttler` on auth endpoints and NLU endpoints (LLM calls cost money — protect against abuse)

### 8.5 Testing Strategy
- Unit tests: services, especially `nlu.service.ts` extraction logic (mock LLM responses)
- Integration tests: auth flow, review-queue confirm flow (real test DB via Docker)
- E2E: one critical path test (signup → add account → NLU input → confirm → dashboard reflects it)

---

## 9. Build Order (maps back to your phased roadmap)

1. **Auth + Users + Profiles** modules first — everything depends on these
2. **Accounts + Transactions + Categories** — core CRUD, no AI yet
3. **Dashboard** — aggregation queries over transactions (good SQL/Prisma practice)
4. **NLU module** — single LLM call, review queue flow
5. **Families + RBAC** — now that Profile exists, layer family linking + guards on top
6. **Integrations (Gmail, Calendar)** — background jobs, OAuth, webhooks
7. **Reminders + Notifications** — cron jobs, email delivery
8. **Spend limits** (family feature) — depends on both Families and Transactions being stable

This order keeps every stage demoable — you're never in a state where nothing works while you build a huge subsystem.
