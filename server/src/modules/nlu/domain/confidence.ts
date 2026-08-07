import { ConfidenceBand } from '@prisma/client';
import type { ExtractedCandidate } from '@/infra/llm/llm.port';

/**
 * Confidence banding and missing-field detection.
 *
 * The thresholds come straight from design 2f, which states them as product
 * rules rather than implementation details:
 *
 *   ≥ 0.90   "Clear"          one-tap confirm
 *   0.70–0.89 "Fairly sure"   uncertain field underlined
 *   < 0.70   "Needs a field"  marigold, never red
 *
 * That last note matters. Marigold in this design means "needs your eye";
 * red means money going out. A low-confidence parse is not an error and must
 * not be coloured like one — the user is confirming their own spending, not
 * grading a model.
 */

export const CLEAR_THRESHOLD = 0.9;
export const FAIRLY_SURE_THRESHOLD = 0.7;

/** Below this, a single field is treated as not really known. */
export const FIELD_UNCERTAIN_THRESHOLD = 0.6;

export function bandFor(confidence: number | null): ConfidenceBand {
  if (confidence === null || Number.isNaN(confidence)) {
    return ConfidenceBand.NEEDS_FIELD;
  }
  if (confidence >= CLEAR_THRESHOLD) return ConfidenceBand.CLEAR;
  if (confidence >= FAIRLY_SURE_THRESHOLD) return ConfidenceBand.FAIRLY_SURE;
  return ConfidenceBand.NEEDS_FIELD;
}

/**
 * Design 2f: an item below the clear threshold "cannot be one-tap-confirmed —
 * forces at least a glance". Anything with a missing required field can't
 * either, regardless of how sure the model claims to be.
 */
export function canOneTapConfirm(
  band: ConfidenceBand,
  missingFields: readonly string[],
): boolean {
  return band === ConfidenceBand.CLEAR && missingFields.length === 0;
}

/** Fields without which a transaction cannot be written to the ledger. */
export const REQUIRED_FIELDS = ['amount'] as const;

/**
 * Fields the UI should prompt for.
 *
 * `amount` is genuinely required — design 3d shows "paid rahul back · amount
 * not found — add it to continue". The others are *soft*: a transaction with
 * no account is still a valid transaction, and design 3c happily confirms one
 * with the account left as a suggestion. So they're reported as missing to
 * drive the prompt, but only `amount` blocks confirmation.
 */
export function findMissingFields(candidate: ExtractedCandidate): string[] {
  const missing: string[] = [];

  if (candidate.amountMinor === null || candidate.amountMinor <= 0) {
    missing.push('amount');
  }
  if (!candidate.category) {
    missing.push('category');
  }
  if (!candidate.account) {
    missing.push('account');
  }
  if (!candidate.date) {
    missing.push('date');
  }

  return missing;
}

/** Whether the candidate can be written to the ledger at all. */
export function isConfirmable(candidate: ExtractedCandidate): boolean {
  return candidate.amountMinor !== null && candidate.amountMinor > 0;
}

/**
 * Fields the model itself was unsure about, for the underline in design 2f.
 *
 * Separate from `findMissingFields`: a field can be *present* and still
 * doubtful. "kirane" confidently maps to Groceries; "utilities-ish" does not,
 * even though both produce a category.
 */
export function uncertainFields(candidate: ExtractedCandidate): string[] {
  return Object.entries(candidate.fieldConfidence)
    .filter(([, score]) => score < FIELD_UNCERTAIN_THRESHOLD)
    .map(([field]) => field);
}

/**
 * The score for the item as a whole.
 *
 * The *minimum* of the field scores, not the average. Averaging lets four
 * confident fields hide one the model effectively guessed — which is exactly
 * the case the review queue exists to catch. A chain is as strong as its
 * weakest link, and so is a parsed transaction.
 *
 * Only fields that were actually extracted count: a null account the user
 * never mentioned shouldn't drag the score down.
 */
export function overallConfidence(candidate: ExtractedCandidate): number {
  const scores: number[] = [candidate.fieldConfidence.amount];

  if (candidate.category) scores.push(candidate.fieldConfidence.category);
  if (candidate.merchant) scores.push(candidate.fieldConfidence.merchant);
  if (candidate.date) scores.push(candidate.fieldConfidence.date);
  if (candidate.account) scores.push(candidate.fieldConfidence.account);

  const weakest = Math.min(...scores);

  // Clamped: a model is free to report 1.2 or -0.1, and the band thresholds
  // and the UI both assume 0–1.
  return Math.max(0, Math.min(1, weakest));
}
