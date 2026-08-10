/**
 * Response types for the ExpenseIQ API.
 *
 * These are hand-written, and that is a deliberate compromise rather than an
 * oversight. The backend's Swagger decorators document request DTOs but not
 * response schemas, so `schema.d.ts` — generated from the live spec — types
 * every response as `Record<string, never>`. Generated types therefore cover
 * paths, params and request bodies; the shapes below cover what comes back.
 *
 * Every type here was verified against a live response, not inferred from the
 * server source. If the API changes, these must change with it — the safety
 * net is the per-phase check against real data, not the compiler.
 */

export interface Money {
  amountMinor: number;
  currency: string;
}

// ---------------------------------------------------------------- auth

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  expiresIn: string;
}

// ------------------------------------------------------------- profiles

export type ProfileKind = "PERSONAL" | "SHARED" | "CHILD";
export type ProfileRole = "OWNER" | "ADULT" | "CHILD";

/** The full design 2c switcher payload — every field the card renders. */
export interface ProfileSummary {
  id: string;
  name: string;
  kind: ProfileKind;
  /** Stored, not derived, so a rename doesn't change the user's colour. */
  initials: string;
  avatarColor: string;
  role: ProfileRole;
  isDefault: boolean;
  /** Display names of the other members — "Shared with Meera". */
  sharedWith: string[];
  monthSpendMinor: number;
  accountCount: number;
  pendingReviewCount: number;
  /** Null unless this is a CHILD profile with an allowance configured. */
  allowanceRemainingMinor: number | null;
}

// ------------------------------------------------------------ categories

export interface Category {
  id: string;
  profileId: string | null;
  name: string;
  /** Two letters — the design renders these instead of icons. */
  monogram: string;
  tint: string;
  isIncome: boolean;
  isSystem: boolean;
  sortOrder: number;
  archivedAt: string | null;
}

// -------------------------------------------------------------- accounts

export type AccountType = "BANK" | "CREDIT_CARD" | "LOAN" | "CASH" | "WALLET";

export interface Account {
  id: string;
  profileId: string;
  type: AccountType;
  name: string;
  issuer: string | null;
  last4: string | null;
  currency: string;
  balanceMinor: number;
  creditLimitMinor: number | null;
  statementDay: number | null;
  dueDay: number | null;
  minDuePercent: number | null;
  principalMinor: number | null;
  emiAmountMinor: number | null;
  interestRate: number | null;
  tenureMonths: number | null;
  emisPaid: number;
  firstEmiDate: string | null;
  isFloatingRate: boolean;
  autoDebit: boolean;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Design 2d's card panel — the computed half the raw account doesn't carry. */
export interface CardPosition {
  outstanding: Money;
  creditLimit: Money;
  available: Money;
  minimumDue: Money;
  utilizationPercent: number;
  isHighUtilization: boolean;
  cycle: {
    statementDate: string;
    dueDate: string;
    daysUntilDue: number;
  };
}

/** Design 2d's loan panel — "98 of 240 EMIs paid · closes Mar 2038". */
export interface LoanPosition {
  principal: Money;
  emi: Money;
  tenureMonths: number;
  emisPaid: number;
  emisRemaining: number;
  outstanding: Money;
  principalPaid: Money;
  interestPaid: Money;
  totalPaid: Money;
  principalClearedPercent: number;
  totalInterestOverLife: Money;
  closureDate: string;
  nextEmiDate: string | null;
}

export interface AccountDetail {
  account: Account;
  card?: CardPosition;
  loan?: LoanPosition;
}

export interface PrepaySimulation {
  prepayment: Money;
  interestSaved: Money;
  monthsSaved: number;
  newClosureDate: string;
}

// ---------------------------------------------------------- transactions

export type Direction = "DEBIT" | "CREDIT";
export type TransactionSource =
  | "MANUAL"
  | "NLU_TEXT"
  | "NLU_AUDIO"
  | "RECEIPT"
  | "RECURRING"
  | "GMAIL"
  | "SMS";

export interface Merchant {
  id: string;
  profileId: string | null;
  normalizedName: string;
  defaultCategoryId: string | null;
  defaultAccountId: string | null;
  seenCount: number;
}

export interface RecurringRule {
  id: string;
  profileId: string;
  categoryId: string | null;
  accountId: string | null;
  amountMinor: number;
  cadence: string;
  nextDueDate: string;
  autoDebit: boolean;
  confidence: number;
  isActive: boolean;
}

/**
 * One transaction with its relations, identical whether it came from
 * GET /transactions or the dashboard's recent list — both are built from the
 * same Prisma include, so one component renders both.
 */
export interface Transaction {
  id: string;
  profileId: string;
  accountId: string | null;
  categoryId: string | null;
  merchantId: string | null;
  amountMinor: number;
  direction: Direction;
  currency: string;
  date: string;
  note: string | null;
  source: TransactionSource;
  sourceLanguage: string | null;
  nluRequestId: string | null;
  recurringRuleId: string | null;
  receiptId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category: Category | null;
  account: Account | null;
  merchant: Merchant | null;
  /** Present means the row belongs to a pattern — drives design 2e's pill. */
  recurringRule: RecurringRule | null;
}

/** Design 6c's filter counts — "Groceries 18". */
export interface Facet {
  id: string | null;
  label: string;
  count: number;
}

export interface TransactionList {
  items: Transaction[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    /** Drives design 6f's "Showing 1–25 of 42". */
    total: number;
    limit: number;
  };
  totals: {
    spendMinor: number;
    incomeMinor: number;
    netMinor: number;
  };
  facets: {
    categories: Facet[];
    accounts: Facet[];
    sources: Facet[];
  };
}

// ------------------------------------------------------------- dashboard

/** Field names follow the server's domain/norms.ts exactly. */
export interface BudgetStatus {
  budget: Money;
  spent: Money;
  remaining: Money;
  usedPercent: number;
  /** Past 80% — the nudge threshold for child spend limits. */
  isApproaching: boolean;
  isOver: boolean;
}

export interface Comparison {
  current: Money;
  previous: Money;
  delta: Money;
  /** Null when last month had no spend — never Infinity. */
  deltaPercent: number | null;
  direction: "up" | "down" | "flat";
}

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  monogram: string;
  tint: string;
  spent: Money;
  sharePercent: number;
}

export interface UpcomingDue {
  accountId: string | null;
  label: string;
  amount: Money;
  minimumDue: Money | null;
  dueDate: string;
  daysUntilDue: number;
  kind: "CARD" | "LOAN" | "RECURRING";
  autoDebit: boolean;
}

export interface NetWorth {
  assets: Money;
  liabilities: Money;
  /** Negative early in a home loan. That is correct, not a bug. */
  net: Money;
}

export interface DashboardSummary {
  greetingName: string | null;
  asOf: string;
  month: {
    spent: Money;
    income: Money;
    budget: BudgetStatus | null;
    versusLastMonth: Comparison;
  };
  topCategories: CategorySlice[];
  upcomingDues: UpcomingDue[];
  pendingReviewCount: number;
  accounts: Account[];
  netWorth: NetWorth;
  recentTransactions: Transaction[];
}

// ------------------------------------------------------------------- nlu

/** Thresholds match the design exactly: ≥0.90, 0.70–0.89, <0.70. */
export type ConfidenceBand = "CLEAR" | "FAIRLY_SURE" | "NEEDS_FIELD";

export interface AccountSuggestion {
  id: string;
  name: string;
  /** Rendered verbatim — "You usually put this on HDFC Millennia". */
  reason: string;
}

export interface NluCandidate {
  reviewItemId: string;
  amountMinor: number | null;
  direction: Direction;
  categoryId: string | null;
  categoryName: string | null;
  merchant: string | null;
  date: string | null;
  accountId: string | null;
  accountName: string | null;
  note: string | null;
  confidence: number;
  confidenceBand: ConfidenceBand;
  /** Fields the UI must prompt for. Only `amount` blocks confirmation. */
  missingFields: string[];
  /** Fields to underline as uncertain, per design 5c. */
  uncertainFields: string[];
  canOneTapConfirm: boolean;
  suggestedAccounts: AccountSuggestion[];
}

export interface NluParseResult {
  requestId: string;
  detectedLanguage: string | null;
  /** Several, because "groceries 300, uber 640, bijli 2400" is three. */
  candidates: NluCandidate[];
}

export interface ConfirmResult {
  transaction: Transaction;
  /**
   * Null once the window has closed. `expiresAt` is an instant, not a
   * duration — the client derives the remaining seconds from it, so a slow
   * response cannot hand out a full 10 seconds that the server will not
   * honour.
   */
  undo: { token: string; expiresAt: string } | null;
}

/**
 * The review queue returns raw rows with `parsed*` field names, not the
 * candidate shape /nlu/parse returns. Transcribed from the Prisma model.
 */
export interface ReviewItemRow {
  id: string;
  profileId: string;
  parsedAmountMinor: number | null;
  parsedDirection: Direction;
  parsedCategoryId: string | null;
  parsedMerchant: string | null;
  parsedAccountId: string | null;
  parsedDate: string | null;
  parsedNote: string | null;
  confidence: number | null;
  confidenceBand: ConfidenceBand | null;
  missingFields: string[];
  suggestedAccountIds: string[];
  status: string;
  source: TransactionSource;
  createdAt: string;
  nluRequest: {
    rawInput: string | null;
    inputMode: string | null;
    detectedLanguage: string | null;
  } | null;
}

// --------------------------------------------------------- notifications

export interface AppNotification {
  id: string;
  profileId: string;
  kind: string;
  title: string;
  body: string | null;
  severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  readAt: string | null;
  createdAt: string;
}
