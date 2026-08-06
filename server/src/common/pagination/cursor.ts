/**
 * Cursor pagination for transaction lists.
 *
 * Offset pagination is wrong for this data: the transaction list is sorted
 * newest-first and gets written to constantly (voice entry, Gmail ingestion,
 * recurring rules). With OFFSET, a row inserted while the user is on page 1
 * pushes a row they already saw onto page 2, so they see it twice. A cursor
 * anchored to (date, id) is stable under concurrent inserts.
 *
 * The `total` still comes back alongside, because design 2e renders
 * "Showing 1–25 of 42" and "42 results · ₹64,210".
 */

export interface PageRequest {
  cursor?: string;
  limit: number;
}

export interface PageResult<T> {
  items: T[];
  page: {
    /** Pass back as `cursor` to fetch the next page. Null at the end. */
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
    limit: number;
  };
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface TransactionCursor {
  date: string;
  id: string;
}

export function encodeCursor(cursor: TransactionCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Returns null for anything unparseable rather than throwing.
 *
 * A stale or hand-edited cursor should quietly restart from the first page,
 * not 500. The client has no way to recover from an error here.
 */
export function decodeCursor(
  raw: string | undefined,
): TransactionCursor | null {
  if (!raw) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Partial<TransactionCursor>;

    if (typeof decoded.date !== 'string' || typeof decoded.id !== 'string') {
      return null;
    }
    if (Number.isNaN(Date.parse(decoded.date))) {
      return null;
    }

    return { date: decoded.date, id: decoded.id };
  } catch {
    return null;
  }
}

export function clampLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_PAGE_SIZE);
}

/**
 * Builds a page from one extra row.
 *
 * Query for `limit + 1` and pass the result here: the presence of the extra
 * row is what proves there's a next page, which avoids a second COUNT query
 * just to answer "is there more?".
 */
export function buildPage<T extends { id: string; date: Date }>(
  rows: T[],
  limit: number,
  total: number,
): PageResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    page: {
      nextCursor:
        hasMore && last
          ? encodeCursor({ date: last.date.toISOString(), id: last.id })
          : null,
      hasMore,
      total,
      limit,
    },
  };
}
