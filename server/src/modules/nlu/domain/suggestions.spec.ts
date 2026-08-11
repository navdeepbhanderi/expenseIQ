import { suggestAccounts, type SuggestionInput } from './suggestions';

const FUEL = 'cat-fuel';
const GROCERIES = 'cat-groceries';

const hdfc = { id: 'acc-hdfc', name: 'HDFC Millennia' };
const sbi = { id: 'acc-sbi', name: 'SBI Savings' };
const cash = { id: 'acc-cash', name: 'Cash' };
const axis = { id: 'acc-axis', name: 'Axis Neo' };

/** categoryId → accountId → times used together. */
function affinityOf(
  entries: Record<string, Record<string, number>>,
): Map<string, Map<string, number>> {
  return new Map(
    Object.entries(entries).map(([categoryId, perAccount]) => [
      categoryId,
      new Map(Object.entries(perAccount)),
    ]),
  );
}

function input(overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    accounts: [hdfc, sbi, cash],
    categoryId: FUEL,
    affinity: affinityOf({}),
    exclude: null,
    ...overrides,
  };
}

describe('suggestAccounts', () => {
  it('ranks the account actually used for this category first', () => {
    const result = suggestAccounts(
      input({
        affinity: affinityOf({
          [FUEL]: { [hdfc.id]: 7 },
          [GROCERIES]: { [sbi.id]: 40 },
        }),
      }),
    );

    expect(result[0]).toEqual({
      id: hdfc.id,
      name: 'HDFC Millennia',
      reason: 'You usually put this on HDFC Millennia',
    });
  });

  it('lets one category use outrank fifty uses elsewhere', () => {
    // The weighting decision this module exists to make. The question is
    // "which account for *this* expense", not "which account do you use most".
    const result = suggestAccounts(
      input({
        affinity: affinityOf({
          [FUEL]: { [hdfc.id]: 1 },
          [GROCERIES]: { [sbi.id]: 50 },
        }),
      }),
    );

    expect(result[0]?.id).toBe(hdfc.id);
  });

  it('falls back to overall usage when the category has no history', () => {
    const result = suggestAccounts(
      input({
        categoryId: 'cat-never-seen',
        affinity: affinityOf({
          [GROCERIES]: { [sbi.id]: 12, [cash.id]: 3 },
        }),
      }),
    );

    expect(result.map((r) => r.id)).toEqual([sbi.id, cash.id, hdfc.id]);
    expect(result[0]?.reason).toBe('Recently used');
  });

  it('orders sensibly with a null category', () => {
    const result = suggestAccounts(
      input({
        categoryId: null,
        affinity: affinityOf({ [GROCERIES]: { [cash.id]: 9 } }),
      }),
    );

    expect(result[0]?.id).toBe(cash.id);
  });

  describe('the "usually" claim', () => {
    // Below three uses the wording overstates what the data supports -
    // "you usually put this on X" after one use is a guess wearing a fact's
    // clothing, and the user sees this string verbatim.
    it.each([
      [1, 'Recently used'],
      [2, 'Recently used'],
      [3, 'You usually put this on HDFC Millennia'],
      [4, 'You usually put this on HDFC Millennia'],
    ])('reads %i uses as "%s"', (uses, expected) => {
      const result = suggestAccounts(
        input({ affinity: affinityOf({ [FUEL]: { [hdfc.id]: uses } }) }),
      );

      expect(result.find((r) => r.id === hdfc.id)?.reason).toBe(expected);
    });

    it('says "Available" for an account with no history at all', () => {
      const result = suggestAccounts(input());

      expect(result.every((r) => r.reason === 'Available')).toBe(true);
    });
  });

  it('never suggests the account already chosen', () => {
    const result = suggestAccounts(
      input({
        exclude: hdfc.id,
        affinity: affinityOf({ [FUEL]: { [hdfc.id]: 20 } }),
      }),
    );

    expect(result.map((r) => r.id)).not.toContain(hdfc.id);
  });

  it('caps at three, because a longer list is a picker not a suggestion', () => {
    const result = suggestAccounts(
      input({ accounts: [hdfc, sbi, cash, axis] }),
    );

    expect(result).toHaveLength(3);
  });

  it('returns nothing when every account is excluded', () => {
    expect(
      suggestAccounts(input({ accounts: [hdfc], exclude: hdfc.id })),
    ).toEqual([]);
    expect(suggestAccounts(input({ accounts: [] }))).toEqual([]);
  });

  it('leaks no internal score onto the returned shape', () => {
    // The score is a ranking device, not part of the contract - the UI renders
    // `reason`, and exposing a raw number invites it being displayed.
    const result = suggestAccounts(
      input({ affinity: affinityOf({ [FUEL]: { [hdfc.id]: 5 } }) }),
    );

    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      'id',
      'name',
      'reason',
    ]);
  });
});
