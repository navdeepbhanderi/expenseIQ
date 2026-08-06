# ExpenseIQ — AI-Powered Expense Tracker
## Full Build Roadmap & Documentation

**Goal:** Build a production-quality, portfolio-worthy expense tracker with LLM-powered multilingual input, automated parsing, smart reminders, and cloud deployment — while learning DSA-adjacent system design, LLM app engineering, and cloud infra (GCP/AWS) along the way.

**Timeline:** Flexible. Target 6-10 weeks for Phases 0-4 (deployable core product). Phases 5-6 are stretch/future work — build them if time allows, document them as roadmap if not.

**Philosophy:** Each phase ends with something *working and demoable*, not half-finished. Deployment happens only after Phase 3 is stable — don't ship broken things to the cloud.

---

## Phase 0 — Foundation & Setup (Week 1)

### Sub-phase 0.1: Planning & Architecture
- [ ] Finalize tech stack (see Appendix A)
- [ ] Draw system architecture diagram (draw.io / excalidraw) — even a rough one now, refine later
- [ ] Define DB schema v1 (see Appendix B) — users, profiles, accounts, transactions, categories
- [ ] Set up GitHub repo with proper structure (`/client`, `/server`, `/docs`)
- [ ] Write initial README with project vision (you'll update this every phase)

### Sub-phase 0.2: Dev Environment
- [ ] Node.js + TypeScript backend scaffold (NestJS recommended — you already know it, and it enforces good architecture patterns like modules/DI which show well in interviews)
- [ ] React + TypeScript frontend scaffold (Vite)
- [ ] PostgreSQL local setup (via Docker — start learning containers now, pays off in Phase 6)
- [ ] Prisma or TypeORM as ORM
- [ ] Basic CI: GitHub Actions running lint + build on push

### Learning focus this phase
- NestJS module architecture (controllers/services/DTOs)
- Docker basics (just enough to run Postgres locally)
- ER diagramming

**Deliverable:** Empty but running full-stack app, Postgres connected, repo structured, README v1 written.

---

## Phase 1 — Core MVP: Auth + Manual Expense Tracking (Weeks 2-3)

### Sub-phase 1.1: Authentication
- [ ] Email/password signup with bcrypt hashing
- [ ] Email verification flow (send link via nodemailer/Resend, verify token, activate account)
- [ ] Google Sign-In (OAuth 2.0)
- [ ] JWT-based session handling (access + refresh tokens)
- [ ] Basic rate limiting on auth endpoints (prevent brute force — good interview talking point)

### Sub-phase 1.2: Profiles & Accounts
- [ ] Multi-profile support (one user → multiple profiles)
- [ ] Profile switcher UI
- [ ] Account types: bank account, credit card, loan/EMI
- [ ] Credit card fields: limit, statement generation date, due date (auto-calculated)
- [ ] Loan fields: principal, EMI amount, tenure, next due date

### Sub-phase 1.3: Manual Expense Entry + Dashboard
- [ ] CRUD for transactions (amount, category, account, date, note)
- [ ] Category management (default categories + custom)
- [ ] Dashboard: monthly spend by category (chart), income vs expense, recent transactions
- [ ] Basic filters (date range, category, account)

### Learning focus this phase
- JWT auth patterns, refresh token rotation
- OAuth 2.0 flow (Google Sign-In)
- Chart libraries (Recharts)
- Postgres relational modeling (foreign keys, indexes)

**Deliverable:** Fully working manual expense tracker. Someone could use this daily even without any AI features. This is your safety-net MVP — if nothing else gets built, this alone is demoable.

---

## Phase 2 — LLM-Powered Natural Language Input (Weeks 4-5)

### Sub-phase 2.1: Basic NLU Pipeline
- [ ] Text input box: "spent 300 rs on groceries today"
- [ ] Gemini API integration — a `responseSchema` constrains the model to structured JSON (amount, category, merchant, date), so validation is a second line of defence rather than the primary one
- [ ] Map extracted category to existing categories (fuzzy match or LLM-assisted)
- [ ] Insert into a **review queue** table, not directly into transactions

### Sub-phase 2.2: Review & Confirm UI
- [ ] "Pending Review" screen — shows parsed fields, editable before confirming
- [ ] Confidence score display (low-confidence entries visually flagged)
- [ ] Confirm → moves to transactions table; Edit → user corrects then confirms; Discard → removed
- [ ] Log corrections separately (for your "feedback loop" interview story)

### Sub-phase 2.3: Multilingual Support
- [ ] LLM prompt updated to detect language + translate + extract in one call
- [ ] Test with Hindi, and 1-2 other regional languages
- [ ] Voice input (Web Speech API) feeding into the same NLU pipeline

### Sub-phase 2.4: Cost & Performance Optimization
- [ ] Cache merchant-name normalization (e.g., "SWIGGY*BLR123" → "Swiggy") so you're not re-calling the LLM for repeat merchants
- [ ] Rate limit LLM calls per user
- [ ] Structured output validation (JSON schema check on LLM response, retry on malformed output)

### Learning focus this phase
- Prompt engineering for structured extraction
- JSON schema validation
- Caching strategies (Redis, or even simple DB-based cache to start)
- Voice-to-text browser APIs

**Deliverable:** You can type or speak "300 rupaye kirane pe kharch kiye" and it correctly parses, shows for review, and lands in your dashboard after confirmation.

---

## Phase 3 — Integrations: Calendar, Reminders, Email Parsing (Weeks 6-7)

### Sub-phase 3.1: Reminders System (build first, no external deps)
- [ ] User sets reminder offset per account (e.g., "3 days before due date")
- [ ] Backend cron/scheduled job checks upcoming due dates daily
- [ ] In-app notification + email reminder

### Sub-phase 3.2: Google Calendar Integration
- [ ] OAuth consent screen for Calendar access (separate, explicit toggle — off by default)
- [ ] Create calendar events for bill due dates via Calendar API
- [ ] Update/delete events when due dates change
- [ ] Google Tasks API integration as an alternative reminder surface (this is the modern replacement for the old standalone "Google Reminders" app)

### Sub-phase 3.3: Gmail Parsing (Opt-in)
- [ ] OAuth consent for Gmail read-only scope, explicit toggle
- [ ] Background job: fetch relevant transactional emails (filtered by sender patterns)
- [ ] Extract structured data via LLM → same review queue as Phase 2
- [ ] **Do not store raw email body** — extract fields, discard source text (privacy-by-design, a strong talking point)
- [ ] Idempotency: track processed email IDs so re-runs don't duplicate entries

### Sub-phase 3.4: Platform-Aware Feature Flags
- [ ] Detect platform (iOS/Android/web) at onboarding
- [ ] SMS parsing toggle: visible only on Android, hidden with explanatory note on iOS
- [ ] SMS parsing (Android only, stretch goal): read financial SMS, parse via LLM, same review queue

### Learning focus this phase
- OAuth scopes & consent screens (Google Cloud Console setup)
- Background job scheduling (node-cron, or BullMQ + Redis for a more "real" queue system)
- Idempotency keys and dedup strategies
- Webhook vs polling tradeoffs (Gmail push notifications vs periodic fetch)

**Deliverable:** Bills auto-appear on your Google Calendar, reminders fire before due dates, and transactional emails get parsed into your review queue — all fully opt-in and toggleable.

---

## Phase 4 — Polish, Testing & Deployment Prep (Week 8)

### Sub-phase 4.1: Testing
- [ ] Unit tests for LLM parsing logic (mock API responses)
- [ ] Integration tests for auth flows
- [ ] E2E test for the core flow: add expense → review → confirm → dashboard updates

### Sub-phase 4.2: Security Hardening
- [ ] Environment variable audit (no secrets in code)
- [ ] Input validation/sanitization on all endpoints
- [ ] HTTPS enforced, CORS configured properly
- [ ] Encrypt sensitive fields at rest (account numbers if you store any)

### Sub-phase 4.3: UX Polish
- [ ] Loading states, empty states, error states across all screens
- [ ] Mobile-responsive pass
- [ ] Undo window (10 sec) after confirming parsed entries

**Deliverable:** A tested, secure, polished app — ready to deploy, not just "working on my machine."

---

## Phase 5 — Cloud Deployment: Learning GCP or AWS (Weeks 9-10)

This is deliberately its own phase, not a footnote — treat it as a learning project in itself.

### Sub-phase 5.1: Choose & Learn Fundamentals
- [ ] Pick one: **GCP** (natural fit since you're already using Gmail/Calendar APIs — same ecosystem, unified IAM) or **AWS** (more universally expected in job postings)
  - Recommendation: **GCP** for this project specifically (tighter integration story with your Gmail/Calendar features — "I deployed the same platform I integrated with" is a nice narrative), but learn AWS basics separately since it's asked about more often in interviews
- [ ] Learn core concepts: compute (Cloud Run / EC2), managed DB (Cloud SQL / RDS), storage, IAM basics

### Sub-phase 5.2: Containerize
- [ ] Dockerize backend and frontend separately
- [ ] Docker Compose for local multi-container testing
- [ ] Push images to a container registry (Artifact Registry / ECR)

### Sub-phase 5.3: Deploy
- [ ] Backend → Cloud Run (GCP) or ECS/Fargate (AWS) — serverless containers, low ops overhead, good for a solo project
- [ ] Frontend → Cloud Storage + CDN, or Firebase Hosting (GCP) / S3 + CloudFront (AWS)
- [ ] Managed Postgres → Cloud SQL or RDS
- [ ] Secrets management → Secret Manager (GCP) or Secrets Manager (AWS), not `.env` files in production

### Sub-phase 5.4: Observability
- [ ] Basic logging (Cloud Logging / CloudWatch)
- [ ] Uptime monitoring (simple health check endpoint + alert)
- [ ] Error tracking (Sentry — free tier is enough)

### Learning focus this phase
- Docker → container registries → orchestration basics
- IAM and least-privilege access
- CI/CD: GitHub Actions deploying automatically on merge to main
- Cost management (set budget alerts — real cloud costs money, this matters)

**Deliverable:** Live URL, running on real cloud infrastructure, with CI/CD auto-deploying on push. This is what goes in your portfolio link.

---

## Phase 6 — Future Roadmap (Document, Build If Time Allows)

Not required for the 2-month core build — but document these in your README as "planned" to show product vision.

### 6.1: Family Accounts & Parental Controls
- Family group creation, member invites
- Kids' profiles: restricted permissions (no card linking, no email/SMS parsing)
- Allowance tracking, spend limits, savings goals
- RBAC (role-based access control) across linked profiles

### 6.2: Smart Insights
- Anomaly/spike detection in spending patterns
- Recurring subscription detector
- Payoff strategy suggestions (snowball vs avalanche) for multiple debts

### 6.3: Advanced
- Multi-currency support
- Offline-first with background sync
- SMS parsing on Android (if not built in Phase 3)

---

## Appendix A: Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript (Vite) | Matches your existing skillset |
| Backend | NestJS | Enforced architecture, good for interview talking points |
| Database | PostgreSQL | Relational data (accounts, transactions) fits well |
| ORM | Prisma | Type-safe, good DX |
| LLM | Google Gemini Pro | Native `responseSchema` for constrained JSON, strong Indic-language support, natively multimodal so receipts need no separate vision model, and one vendor with the Gmail/Calendar/Tasks integrations |
| Queue/Jobs | BullMQ + Redis | For email parsing, reminders (Phase 3+) |
| Auth | JWT + Google OAuth | Standard, well-documented |
| Cloud | GCP (Cloud Run, Cloud SQL) | Ecosystem fit with Gmail/Calendar APIs |
| Monitoring | Sentry + Cloud Logging | Free tier sufficient |

---

## Appendix B: Initial DB Schema (v1 — expand as you go)

```
users
  id, email, password_hash, google_id, email_verified, created_at

profiles
  id, user_id, name, is_default, created_at

accounts
  id, profile_id, type (bank|credit_card|loan), name,
  balance, credit_limit, statement_date, due_date,
  interest_rate, created_at

transactions
  id, profile_id, account_id, amount, category,
  merchant, date, note, source (manual|nlu|email|sms),
  created_at

review_queue
  id, profile_id, raw_input, parsed_amount, parsed_category,
  parsed_merchant, confidence_score, status (pending|confirmed|discarded),
  source, created_at

categories
  id, profile_id (nullable = default), name, icon

reminders
  id, account_id, offset_days, channel (email|push|calendar), enabled

integrations
  id, profile_id, type (gmail|calendar|sms), enabled, oauth_token_ref, connected_at
```

---

## How to Use This Document

- Treat each **Phase** as a milestone, each **Sub-phase** as a sprint (roughly 3-5 days)
- Check off tasks as you go — don't move to the next sub-phase with half-done items
- Update the README after every phase completion — this becomes your portfolio narrative *and* your interview prep material simultaneously
- If a sub-phase is taking too long, it's fine to descope — mark it "Phase 6 / Future" instead of rushing a broken version
