/**
 * The seam between the app and whatever model is behind it.
 *
 * The NLU module depends on this interface and never on `@google/genai`, so
 * swapping providers — or stubbing the model entirely in tests — touches one
 * folder. `InjectionToken` exists because an interface has no runtime value
 * for Nest's DI to resolve.
 */

export const LLM_PORT = Symbol('LLM_PORT');

/**
 * All three input kinds are declared now even though Phase 4 only ships text.
 *
 * It costs nothing today and means audio (Phase 4 stretch) and images
 * (Phase 5 receipts) don't reshape the module later — Gemini handles all
 * three through the same call.
 */
export type ParseInput =
  | { kind: 'text'; text: string }
  | { kind: 'audio'; data: Buffer; mimeType: string }
  | { kind: 'image'; data: Buffer; mimeType: string };

export interface ExtractionContext {
  /** Category names the model must choose from, so it can't invent one. */
  categories: string[];
  /** Account names, for "petrol 1200 hdfc card". */
  accounts: string[];
  /** Known merchants, which sharpens normalisation of messy descriptors. */
  knownMerchants: string[];
  /** The user's today, so "yesterday" and "kal" resolve correctly. */
  today: Date;
  /** IANA zone. A date is a calendar fact in the user's locale, not UTC. */
  timezone: string;
}

/** One candidate transaction found in the input. */
export interface ExtractedCandidate {
  /** Paise. Null when the input didn't contain an amount. */
  amountMinor: number | null;
  direction: 'DEBIT' | 'CREDIT';
  /** Must match one of `context.categories`, or null. */
  category: string | null;
  merchant: string | null;
  /** ISO date. Null when the input didn't say. */
  date: string | null;
  /** Must match one of `context.accounts`, or null. */
  account: string | null;
  note: string | null;
  /** 0–1, the model's own confidence in this candidate as a whole. */
  confidence: number;
  /** 0–1 per field, so the UI can underline just the uncertain one. */
  fieldConfidence: {
    amount: number;
    category: number;
    merchant: number;
    date: number;
    account: number;
  };
}

export interface ExtractionResult {
  /** BCP-47 or a bare language name as the model reports it. */
  detectedLanguage: string | null;
  /**
   * Several, because one utterance can describe several expenses —
   * "groceries 300, uber 640, and bijli ka bill 2400" is three.
   */
  candidates: ExtractedCandidate[];
  /** Observability, so Pro/Flash routing can be measured rather than guessed. */
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** A partial reading emitted while the user is still speaking. */
export interface PartialExtraction {
  transcript: string;
  detectedLanguage: string | null;
  /** Best guess so far. Design 5b: "Reading as ₹300 · Groceries · today". */
  preview: {
    amountMinor: number | null;
    category: string | null;
    date: string | null;
  };
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmPort {
  /** Which tier the adapter will use. Surfaced so tests can assert routing. */
  readonly name: string;

  extract(
    input: ParseInput,
    context: ExtractionContext,
  ): Promise<ExtractionResult>;

  /** Drives the SSE endpoint behind design 5b and 3b. */
  extractStream(
    input: ParseInput,
    context: ExtractionContext,
  ): AsyncIterable<PartialExtraction>;

  /**
   * Cheap, high-volume work — the Flash tier. Kept separate from `extract`
   * so routing is a property of the call site's intent rather than a flag.
   */
  normalizeMerchant(raw: string, known: string[]): Promise<string>;
}
