import { AccountType, Direction } from '@prisma/client';

/**
 * How one transaction moves the balance of the account it is on.
 *
 * This existed nowhere. Transactions were written and account balances were
 * never touched, so `balanceMinor` was whatever number the user typed when
 * they created the account and stayed there for good: spending ₹5,000 twice on
 * a credit card left it reading ₹0 outstanding and "0% of limit used", while
 * both rows sat plainly in the ledger underneath.
 *
 * **The sign depends on what kind of account it is**, which is the part that
 * makes this worth its own module rather than an inline `+`/`-`.
 *
 * For an asset — a bank account, cash, a wallet — the balance is what you
 * have, so spending reduces it and income adds to it.
 *
 * For a liability — a credit card, a loan — `balanceMinor` is what you *owe*,
 * so the signs invert: a purchase increases the balance, and a payment or a
 * refund reduces it. Getting this backwards is not a rounding error; it makes
 * a card read as credit in hand and inverts net worth.
 */

const LIABILITIES: AccountType[] = [AccountType.CREDIT_CARD, AccountType.LOAN];

export function isLiability(type: AccountType): boolean {
  return LIABILITIES.includes(type);
}

/**
 * The signed amount to add to `balanceMinor`.
 *
 * Takes the magnitude, since transactions are stored as a positive amount with
 * the direction alongside.
 */
export function balanceDelta(
  accountType: AccountType,
  direction: Direction,
  amountMinor: bigint,
): bigint {
  const magnitude = amountMinor < 0n ? -amountMinor : amountMinor;
  const spending = direction === Direction.DEBIT;

  // Spending raises what you owe on a liability and lowers what you hold in an
  // asset; income does the reverse of each.
  const increases = isLiability(accountType) ? spending : !spending;

  return increases ? magnitude : -magnitude;
}
