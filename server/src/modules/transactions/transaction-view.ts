import type { Prisma } from '@prisma/client';

/**
 * The relations every transaction payload carries, wherever it is served from.
 *
 * Shared rather than repeated because the transaction list and the dashboard's
 * recent-transactions list are rendered by the same UI component. Two includes
 * that start identical and drift apart produce a row that renders fine on one
 * screen and shows a blank category on the other - a bug that only appears on
 * whichever screen was updated second.
 */
export const TRANSACTION_RELATIONS = {
  category: true,
  account: true,
  merchant: true,
  // Included so design 2e can render the "Recurring" pill. The `source` enum
  // only says RECURRING for rows a rule *generated*; a row that merely
  // belongs to a detected pattern is identified by this relation, and that is
  // the case the pill actually marks.
  recurringRule: true,
} as const satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_RELATIONS;
}>;
