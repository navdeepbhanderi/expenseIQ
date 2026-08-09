import { ConfidenceBand } from '@prisma/client';
import type { ExtractedCandidate } from '@/infra/llm/llm.port';
import {
  bandFor,
  canOneTapConfirm,
  CLEAR_THRESHOLD,
  FAIRLY_SURE_THRESHOLD,
  findMissingFields,
  isConfirmable,
  overallConfidence,
  uncertainFields,
} from './confidence';

const candidate = (
  overrides: Partial<ExtractedCandidate> = {},
): ExtractedCandidate => ({
  amountMinor: 30_000,
  direction: 'DEBIT',
  category: 'Groceries',
  merchant: null,
  date: '2026-08-05',
  account: 'SBI Savings',
  note: null,
  confidence: 0.95,
  fieldConfidence: {
    amount: 0.99,
    category: 0.95,
    merchant: 0.9,
    date: 0.98,
    account: 0.92,
  },
  ...overrides,
});

describe('bandFor', () => {
  it('uses the exact thresholds design 2f states', () => {
    expect(bandFor(0.95)).toBe(ConfidenceBand.CLEAR);
    expect(bandFor(0.82)).toBe(ConfidenceBand.FAIRLY_SURE);
    expect(bandFor(0.5)).toBe(ConfidenceBand.NEEDS_FIELD);
  });

  it('is inclusive at both boundaries', () => {
    // A score of exactly 0.90 is Clear, exactly 0.70 is Fairly sure.
    expect(bandFor(CLEAR_THRESHOLD)).toBe(ConfidenceBand.CLEAR);
    expect(bandFor(CLEAR_THRESHOLD - 0.0001)).toBe(ConfidenceBand.FAIRLY_SURE);
    expect(bandFor(FAIRLY_SURE_THRESHOLD)).toBe(ConfidenceBand.FAIRLY_SURE);
    expect(bandFor(FAIRLY_SURE_THRESHOLD - 0.0001)).toBe(
      ConfidenceBand.NEEDS_FIELD,
    );
  });

  it('treats an absent score as needing a field, never as clear', () => {
    // A failed extraction must not fall through to one-tap confirm.
    expect(bandFor(null)).toBe(ConfidenceBand.NEEDS_FIELD);
    expect(bandFor(Number.NaN)).toBe(ConfidenceBand.NEEDS_FIELD);
  });
});

describe('canOneTapConfirm', () => {
  it('allows it only when clear and complete', () => {
    expect(canOneTapConfirm(ConfidenceBand.CLEAR, [])).toBe(true);
  });

  it('blocks a merely fairly-sure item', () => {
    // Design 2f: below the clear threshold the item "cannot be
    // one-tap-confirmed — forces at least a glance".
    expect(canOneTapConfirm(ConfidenceBand.FAIRLY_SURE, [])).toBe(false);
    expect(canOneTapConfirm(ConfidenceBand.NEEDS_FIELD, [])).toBe(false);
  });

  it('blocks a confident item that is still missing something', () => {
    expect(canOneTapConfirm(ConfidenceBand.CLEAR, ['account'])).toBe(false);
  });
});

describe('findMissingFields', () => {
  it('finds nothing on a complete candidate', () => {
    expect(findMissingFields(candidate())).toEqual([]);
  });

  it('reports a missing amount — design 3d`s "amount not found"', () => {
    expect(findMissingFields(candidate({ amountMinor: null }))).toContain(
      'amount',
    );
  });

  it('treats a zero amount as missing, not as a real transaction', () => {
    expect(findMissingFields(candidate({ amountMinor: 0 }))).toContain(
      'amount',
    );
  });

  it('reports a missing account — design 3d`s "Which account?"', () => {
    expect(findMissingFields(candidate({ account: null }))).toEqual([
      'account',
    ]);
  });

  it('reports a missing category', () => {
    expect(findMissingFields(candidate({ category: null }))).toEqual([
      'category',
    ]);
  });

  it('reports a missing date', () => {
    expect(findMissingFields(candidate({ date: null }))).toEqual(['date']);
  });

  it('reports every missing field at once, amount first', () => {
    // Order matters to the UI, which prompts for the first blocking field.
    // Only `amount` blocks confirmation, so it has to lead.
    expect(
      findMissingFields(
        candidate({
          amountMinor: null,
          category: null,
          account: null,
          date: null,
        }),
      ),
    ).toEqual(['amount', 'category', 'account', 'date']);
  });
});

describe('isConfirmable', () => {
  it('requires only an amount', () => {
    // Design 3c confirms an entry whose account is still just a suggestion,
    // so account cannot be a hard requirement.
    expect(isConfirmable(candidate({ account: null, category: null }))).toBe(
      true,
    );
  });

  it('refuses without an amount', () => {
    // "paid rahul back" — nothing to write to the ledger.
    expect(isConfirmable(candidate({ amountMinor: null }))).toBe(false);
    expect(isConfirmable(candidate({ amountMinor: 0 }))).toBe(false);
  });
});

describe('uncertainFields', () => {
  it('flags only the doubtful ones', () => {
    const result = uncertainFields(
      candidate({
        fieldConfidence: {
          amount: 0.99,
          category: 0.4,
          merchant: 0.95,
          date: 0.98,
          account: 0.3,
        },
      }),
    );

    expect(result).toEqual(['category', 'account']);
  });

  it('is distinct from missing — a field can be present and still doubtful', () => {
    const doubtful = candidate({
      category: 'Utilities',
      fieldConfidence: {
        amount: 0.99,
        category: 0.35,
        merchant: 0.9,
        date: 0.98,
        account: 0.92,
      },
    });

    expect(findMissingFields(doubtful)).toEqual([]);
    expect(uncertainFields(doubtful)).toEqual(['category']);
  });
});

describe('overallConfidence', () => {
  it('takes the weakest field, not the average', () => {
    // Averaging lets four confident fields hide one the model guessed —
    // exactly the case the review queue exists to catch.
    const result = overallConfidence(
      candidate({
        fieldConfidence: {
          amount: 0.99,
          category: 0.4,
          merchant: 0.99,
          date: 0.99,
          account: 0.99,
        },
      }),
    );

    expect(result).toBe(0.4);
    expect(bandFor(result)).toBe(ConfidenceBand.NEEDS_FIELD);
  });

  it('ignores fields the input never mentioned', () => {
    // A null account the user never said shouldn't drag the score down.
    const result = overallConfidence(
      candidate({
        account: null,
        merchant: null,
        fieldConfidence: {
          amount: 0.99,
          category: 0.95,
          merchant: 0.1,
          date: 0.98,
          account: 0.1,
        },
      }),
    );

    expect(result).toBe(0.95);
  });

  it('clamps a model that reports outside 0–1', () => {
    expect(
      overallConfidence(
        candidate({
          fieldConfidence: {
            amount: 1.4,
            category: 1.4,
            merchant: 1.4,
            date: 1.4,
            account: 1.4,
          },
        }),
      ),
    ).toBe(1);

    expect(
      overallConfidence(
        candidate({
          fieldConfidence: {
            amount: -0.5,
            category: 0.9,
            merchant: 0.9,
            date: 0.9,
            account: 0.9,
          },
        }),
      ),
    ).toBe(0);
  });
});
