/**
 * Ranked account guesses — design 3d's "You usually put fuel on HDFC Millennia"
 * and design 2b's "Usually: SBI Savings, Cash, HDFC Millennia".
 *
 * Pure history, no model involved. Which card someone puts petrol on is a fact
 * about their past behaviour, and a database query answers it better, faster
 * and for free compared with asking an LLM to speculate.
 */

export interface AccountSuggestion {
  id: string;
  name: string;
  /** Rendered verbatim by the UI, so it explains itself. */
  reason: string;
}

export interface SuggestionInput {
  accounts: { id: string; name: string }[];
  categoryId: string | null;
  /** categoryId → accountId → times used together. */
  affinity: Map<string, Map<string, number>>;
  /** The account already chosen, if any — no point suggesting it again. */
  exclude: string | null;
}

/** Below this many uses, "usually" overstates the evidence. */
const MIN_USES_FOR_USUALLY = 3;

export function suggestAccounts(input: SuggestionInput): AccountSuggestion[] {
  const { accounts, categoryId, affinity, exclude } = input;
  const available = accounts.filter((account) => account.id !== exclude);

  if (available.length === 0) return [];

  const forCategory = categoryId ? affinity.get(categoryId) : undefined;

  // Overall usage, so a profile with no history for *this* category still
  // gets a sensible ordering rather than an arbitrary one.
  const overall = new Map<string, number>();
  for (const perAccount of affinity.values()) {
    for (const [accountId, count] of perAccount) {
      overall.set(accountId, (overall.get(accountId) ?? 0) + count);
    }
  }

  return (
    available
      .map((account) => {
        const forThisCategory = forCategory?.get(account.id) ?? 0;
        const overallUses = overall.get(account.id) ?? 0;

        return {
          id: account.id,
          name: account.name,
          // Category affinity dominates: a card used once for fuel should
          // outrank a card used fifty times for everything else, because the
          // question being answered is "which account for *this* expense".
          score: forThisCategory * 1000 + overallUses,
          reason:
            forThisCategory >= MIN_USES_FOR_USUALLY
              ? `You usually put this on ${account.name}`
              : overallUses > 0
                ? 'Recently used'
                : 'Available',
        };
      })
      .sort((a, b) => b.score - a.score)
      // Three is what design 2b shows, and a longer list stops being a
      // suggestion and becomes a picker the user has to read.
      .slice(0, 3)
      .map(({ id, name, reason }) => ({ id, name, reason }))
  );
}
