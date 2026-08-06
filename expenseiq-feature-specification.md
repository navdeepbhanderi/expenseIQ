# ExpenseIQ — Complete Feature Documentation
## Phase-Wise Detailed Specification

This document details **every feature**, its purpose, user flow, edge cases, and acceptance criteria — organized by the same phases as the build roadmap, so you can build directly from this.

---

# PHASE 0 — Foundation
*(No user-facing features — infra only. See architecture doc.)*

---

# PHASE 1 — Core MVP

## 1.1 Authentication

### 1.1.1 Email/Password Signup
**Purpose:** Standard account creation for users without Google accounts or who prefer not to use OAuth.

**Flow:**
1. User enters email + password (+ confirm password)
2. Frontend validates: email format, password strength (min 8 chars, 1 number, 1 special char)
3. Backend checks email uniqueness → creates user with `emailVerified: false`
4. Verification email sent with time-limited token (24h expiry)
5. User cannot log in until verified — login attempt shows "Please verify your email" with a resend option

**Edge cases:**
- Duplicate email → generic error ("account may already exist") — don't leak which emails are registered (security)
- Expired verification token → allow resend, invalidate old token
- User signs up with email, later tries Google Sign-In with same email → link accounts automatically if email matches and is verified

**Acceptance criteria:** User cannot access any protected route without a verified account.

### 1.1.2 Email Verification
**Purpose:** Confirm email ownership before granting access — prevents fake accounts, ensures reminder emails actually reach the user.

**Flow:**
1. Click link in email → `/auth/verify-email?token=xxx`
2. Backend validates token, marks `emailVerified: true`, redirects to login with success message

### 1.1.3 Google Sign-In
**Purpose:** Frictionless signup, matches your stated requirement.

**Flow:**
1. User clicks "Continue with Google" → OAuth consent
2. Backend receives Google profile → if `googleId` exists, log in; if email exists but no `googleId`, link accounts; else create new user with `emailVerified: true` (Google already verified it)

### 1.1.4 Login & Session Management
**Flow:**
1. Login → backend issues short-lived access token (15 min) + long-lived refresh token (7 days, httpOnly cookie)
2. Frontend silently refreshes access token before expiry
3. Logout → refresh token invalidated server-side (stored in DB or Redis with revocation check)

**Edge case:** Refresh token reuse detection — if an already-used refresh token is presented again, treat as potential theft and invalidate the entire token family (force re-login).

---

## 1.2 Profiles

### 1.2.1 Multi-Profile Support
**Purpose:** One user can manage multiple financial "contexts" — e.g., personal vs a side business, or (later) linked family members.

**Flow:**
1. New user gets one default profile auto-created ("Personal")
2. User can create additional profiles from a profile switcher (top-nav dropdown)
3. Each profile has fully isolated accounts, transactions, categories, integrations

**Edge cases:**
- Cannot delete the last remaining profile
- Deleting a profile requires confirmation + shows what will be lost (X accounts, Y transactions)

---

## 1.3 Accounts (Bank / Credit Card / Loan)

### 1.3.1 Bank Account
**Fields:** name, current balance (optional, user-entered — this isn't live bank sync)
**Purpose:** Track cash/bank balance manually, associate transactions with a source.

### 1.3.2 Credit Card
**Fields:** name, credit limit, statement generation date (day of month), due date (day of month), current balance/utilization

**Statement/due date logic:**
- User enters statement date (e.g., 5th) and due date (e.g., 25th)
- App computes: "Next statement: Aug 5, Next due: Aug 25"
- If due date < statement date numerically (e.g., statement on 28th, due on 15th) → due date rolls to *next* month automatically

**Edge case:** Statement date near month-end (29/30/31) in months without that date (Feb) → clamp to last day of that month.

### 1.3.3 Loan / EMI
**Fields:** principal, interest rate, EMI amount, tenure (months), next due date (day of month)

**Auto-calculation:** Given principal, rate, tenure → optionally auto-compute EMI (standard EMI formula) if user doesn't want to enter it manually, but allow override since real EMI may include insurance/fees.

**Progress tracking:** Show "X of Y EMIs paid" and remaining balance estimate — this is a dashboard feature (see 1.4).

---

## 1.4 Manual Expense Entry & Dashboard

### 1.4.1 Add Transaction (Manual)
**Fields:** amount, category, account (optional), date, note

### 1.4.2 Categories
- System default categories (Food, Transport, Bills, Shopping, Entertainment, Health, Other) pre-seeded
- User can add custom categories per profile
- Categories have an icon (from a fixed icon set, not free-text to keep UI consistent)

### 1.4.3 Dashboard
**Widgets:**
- **Monthly spend by category** — donut/pie chart
- **Income vs expense trend** — line chart, last 6 months
- **Recent transactions** — list, last 10
- **Upcoming dues** — cards showing next 3 upcoming credit card/loan due dates with amount and days-remaining
- **Credit utilization** — per card, balance/limit as a progress bar (flag in red if >30% utilization — real financial literacy signal)

### 1.4.4 Filters
Date range, category, account — combinable, applied to transaction list view.

---

# PHASE 2 — LLM-Powered Natural Language Input

## 2.1 Text-Based NLU Entry
**Purpose:** Faster entry than manual form-filling — type naturally instead of selecting dropdowns.

**Flow:**
1. User types: "spent 300 rs on groceries today" (or in Gujarati/Hindi)
2. Sent to `/nlu/parse` → LLM extracts `{ amount: 300, category: "Groceries", merchant: null, date: today }`
3. Result appears in **Review Queue**, not directly in transactions

**Why review queue, not direct insert (recap):** LLM extraction can be wrong (ambiguous amounts, misread category). Direct insert would corrupt the ledger silently. Review queue = trust layer.

## 2.2 Voice Input
**Purpose:** Even faster than typing, key for regional-language users who may not type comfortably.

**Flow:**
1. Mic button → Web Speech API transcribes speech to text (in selected language)
2. Transcribed text fed into same NLU pipeline as 2.1

**Edge case:** Poor transcription quality (background noise, accent) → show transcribed text to user *before* sending to LLM, let them correct it first (saves an LLM call on garbage input, and is more transparent).

## 2.3 Multilingual Handling
**Purpose:** Core requirement — support regional Indian languages (Gujarati, Hindi, others as time allows).

**Approach:** Single LLM call does language detection + internal translation + field extraction. User never sees a "translation" step — it's invisible, they just get correct structured output regardless of input language.

**Edge case:** Code-mixed input (Hinglish/Gujlish — "300 rupiya spend kiya groceries pe") is extremely common in India — the prompt must explicitly handle mixed-language input, not just pure single-language sentences. Test cases should include this.

## 2.4 Review & Confirm UI
**Screen:** "Pending Review" — list of parsed items awaiting confirmation

**Per item, shown:**
- Original raw input (for context/trust)
- Parsed fields (amount, category, merchant, date) — each editable inline
- Confidence indicator (High/Medium/Low badge)
- Actions: ✅ Confirm | ✏️ Edit then Confirm | 🗑️ Discard

**Low-confidence handling:** If confidence score below threshold, item is visually flagged (amber border) and cannot be one-tap-confirmed — forces at least a glance/edit before confirming, reducing silent errors.

**Undo:** After confirm, 10-second undo toast before it's "final" (though even after that, user can still edit/delete from the transaction list normally — this is just a UX nicety for immediate mis-taps).

## 2.5 Cost & Performance Optimization

### 2.5.1 Merchant Normalization Cache
**Purpose:** Recurring merchants (e.g., "SWIGGY*BLR9284") shouldn't trigger a fresh LLM call every time.

**Flow:** First time a merchant string is seen → LLM normalizes it → cached (merchant string → clean name + likely category) → future occurrences use cache directly, skip LLM call entirely for that field.

### 2.5.2 Rate Limiting
Per-user cap on NLU calls per hour (generous, but prevents runaway costs from bugs or abuse).

### 2.5.3 Structured Output Validation
LLM response validated against a strict JSON schema before use. Malformed response → one retry with the error appended to the prompt ("previous response was invalid because X, return valid JSON only"). Still fails → falls into review queue with null confidence, raw input preserved.

---

# PHASE 3 — Integrations

## 3.1 Reminders System

### 3.1.1 Reminder Configuration
**Per account**, user sets:
- Offset (e.g., "remind me 3 days before due date")
- Channel(s): Email, Push, Calendar (multi-select — can enable more than one)

### 3.1.2 Reminder Delivery
Daily scheduled job scans all accounts, checks if `dueDate - offsetDays == today`, sends via configured channel(s).

**Edge case:** If reminder settings change *after* a reminder for that cycle already fired, don't re-fire (track last-fired date per account/cycle to prevent duplicates).

## 3.2 Google Calendar Integration
**Purpose:** Native reminders on any device already synced to the user's Google Calendar — reaches the user without building your own notification infra beyond what's necessary.

**Flow:**
1. User toggles "Connect Google Calendar" (off by default) → OAuth consent screen, scoped only to Calendar
2. On connect: for every credit card/loan account, create a recurring calendar event on the due date
3. On due date change: update the existing event (store `calendarEventId` per account to know what to update, not recreate)
4. On disconnect: offer to delete created events or leave them (user choice)

## 3.3 Google Tasks Integration
**Purpose:** Alternative reminder surface for users who use Tasks instead of/alongside Calendar (this is the current equivalent of the old standalone "Reminders" app).

**Flow:** Same pattern as Calendar — create a Task per due account, with due date and a link back to the app.

## 3.4 Gmail Parsing (Opt-in)
**Purpose:** Automatically capture spends from transactional emails (payment confirmations, bill receipts) without manual entry.

**Flow:**
1. User toggles "Connect Gmail" (off by default, clearly explained what's being requested and why before OAuth)
2. Backend fetches emails matching known transactional sender patterns (banks, payment apps, e-commerce)
3. Each matching email → LLM extracts amount, merchant, date → written to Review Queue with `source: EMAIL`
4. **Raw email body is never stored** — only extracted structured fields persist. This is a hard rule, not a nice-to-have.
5. Processed email IDs tracked (`sourceRefId`) so re-runs/re-polls don't create duplicate review items — enforced via DB unique constraint, not just app logic

**Sync strategy:** Start with periodic polling (every 15 min) for simplicity; Gmail push notifications (via Pub/Sub) are a stretch upgrade — mention both in interviews, build polling first.

**Edge case:** User disconnects Gmail mid-way through a batch job — job should check `Integration.enabled` before processing each email, not just at job start, so a disconnect mid-run stops further processing.

## 3.5 Platform-Aware Feature Flags

### 3.5.1 iOS vs Android Detection
At onboarding (and stored on user/device), detect platform via user-agent or app-level flag (if wrapped as a mobile app later).

### 3.5.2 SMS Parsing (Android only)
- Toggle only visible on Android
- On iOS: toggle hidden, replaced with a short note explaining the platform restriction, pointing users to email parsing or voice/text entry instead
- If built: reads financial SMS (with explicit Android runtime permission), same LLM extraction → Review Queue pipeline as email, `source: SMS`

---

# PHASE 4 — Polish, Testing, Deployment Prep
*(Engineering quality features, not user-facing — see architecture doc for testing strategy, security hardening checklist.)*

---

# PHASE 5 — Cloud Deployment
*(Infra, not features — see architecture doc / roadmap doc.)*

---

# PHASE 6 (Now Elevated — Family & RBAC)

## 6.1 Family Group Creation
**Flow:**
1. Any user can create a Family (becomes `OWNER`)
2. Owner invites members by email → invite link with time-limited token
3. Invitee accepts → their existing profile (or a new one they create) gets linked into the family with a chosen role (`ADULT` or `CHILD`, set by inviter)

## 6.2 Roles & Permissions
See the full permission matrix in the architecture doc (section 3.2). Summary:
- **OWNER** — full control, can invite/remove members, set spend limits on CHILD profiles
- **ADULT** — can view family members' summaries (not full detail unless it's their own profile), manage their own profile fully
- **CHILD** — restricted: manual entry only, no card/loan linking, no email/SMS parsing, subject to spend limits set by OWNER

## 6.3 Child Profile Restrictions (Enforced, not just hidden UI)
**Important:** restrictions must be enforced server-side (via guards), not just hidden in the UI — a determined user could otherwise hit the API directly and bypass a UI-only restriction.

- Attempting to link a credit card on a CHILD profile → 403 Forbidden, clear error message
- Attempting to enable Gmail/SMS parsing on CHILD profile → 403 Forbidden

## 6.4 Allowance & Spend Limits
**Allowance:** OWNER sets a recurring amount credited to CHILD profile (tracked as a special transaction type or a running balance field — design choice, recommend: treat as an "income" transaction auto-created monthly).

**Spend limits:** OWNER sets a monthly cap per category (or overall) on a CHILD profile. When CHILD's spend approaches/exceeds the limit:
- Approaching (80%): in-app nudge notification
- Exceeded: transaction still allowed (don't hard-block real spending decisions) but flagged, and OWNER gets notified

**Design rationale:** Nudge over hard-block — this is a financial literacy tool, not a parental lockout system. Blocking transactions outright could push kids to just not log them, defeating the purpose.

## 6.5 Savings Goals (stretch within 6.x)
CHILD sets a goal (name, target amount, optional target date). Progress bar on dashboard. OWNER can optionally "contribute" — a manual transfer-like transaction crediting the goal.

## 6.6 Family Dashboard (OWNER/ADULT view)
Aggregate view across all linked family profiles — total household spend, per-member breakdown, upcoming dues across all accounts in the family. This is a genuinely differentiated feature — most personal finance apps don't do cross-profile aggregation well.

---

# Future / Not Yet Scoped (mention in README as roadmap, don't build yet)

- Anomaly/spike detection in spending
- Recurring subscription detector
- Debt payoff strategy suggestions (snowball/avalanche)
- Multi-currency support
- Offline-first with background sync

---

# Cross-Feature Notes

## Data Privacy Principles (apply across all features)
1. Raw source content (emails, SMS bodies) never persisted — only extracted structured fields
2. All integrations opt-in, off by default, individually toggleable
3. OAuth tokens stored as references to a secrets store, never in plaintext in the primary DB
4. CHILD profiles get maximum restriction by default — no integrations available at all, regardless of family settings

## Human-in-the-Loop Principle (applies to all AI-parsed data)
Every automated extraction — whether from voice, text, email, or SMS — lands in the Review Queue first. Nothing AI-parsed hits the ledger without explicit user confirmation. This is the single most important trust mechanism in the entire product and should be mentioned prominently in your README and interview answers.
