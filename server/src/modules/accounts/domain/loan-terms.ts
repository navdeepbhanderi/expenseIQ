import type { Account } from '@prisma/client';
import { Money } from '@/common/money/money';
import type { LoanTerms } from './amortization';

/**
 * Reads loan terms off an account row, or returns null when they're incomplete.
 *
 * Null rather than throwing, because the two callers want opposite things: the
 * account detail endpoint should fail loudly on a half-configured loan, while
 * the dashboard must not let one bad row take the whole screen down. Returning
 * null lets each decide.
 */
export function loanTermsFrom(account: Account): LoanTerms | null {
  if (
    account.principalMinor === null ||
    account.interestRate === null ||
    account.tenureMonths === null ||
    account.firstEmiDate === null
  ) {
    return null;
  }

  return {
    principal: Money.fromBigInt(account.principalMinor),
    annualRatePercent: account.interestRate,
    tenureMonths: account.tenureMonths,
    // Only when the user actually supplied one - a stored zero would read as
    // "an EMI of nothing" rather than "not specified".
    ...(account.emiAmountMinor !== null && account.emiAmountMinor > 0n
      ? { emi: Money.fromBigInt(account.emiAmountMinor) }
      : {}),
    firstEmiDate: account.firstEmiDate,
  };
}
