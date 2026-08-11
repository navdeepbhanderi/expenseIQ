import {
  buildPage,
  clampLimit,
  decodeCursor,
  encodeCursor,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './cursor';

describe('cursor pagination', () => {
  describe('encode/decode', () => {
    it('round-trips', () => {
      const cursor = { date: '2026-08-05T18:40:00.000Z', id: 'tx-1' };
      expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    });

    it('returns null for junk rather than throwing', () => {
      // A stale cursor should restart at page 1, not 500 - the client has no
      // way to recover from an error here.
      expect(decodeCursor('not-base64!!')).toBeNull();
      expect(decodeCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
      expect(decodeCursor(undefined)).toBeNull();
    });

    it('rejects a cursor carrying an invalid date', () => {
      const bad = Buffer.from(
        JSON.stringify({ date: 'yesterday', id: 'x' }),
      ).toString('base64url');
      expect(decodeCursor(bad)).toBeNull();
    });
  });

  describe('clampLimit', () => {
    it('defaults and bounds', () => {
      expect(clampLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampLimit(10)).toBe(10);
      expect(clampLimit(0)).toBe(1);
      expect(clampLimit(5000)).toBe(MAX_PAGE_SIZE);
      expect(clampLimit(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
    });
  });

  describe('buildPage', () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `tx-${i}`,
        date: new Date(`2026-08-0${(i % 5) + 1}T00:00:00.000Z`),
      }));

    it('detects a next page from the extra row without a second query', () => {
      const page = buildPage(rows(26), 25, 42);
      expect(page.items).toHaveLength(25);
      expect(page.page.hasMore).toBe(true);
      expect(page.page.nextCursor).not.toBeNull();
      expect(page.page.total).toBe(42);
    });

    it('closes the page when there is no extra row', () => {
      const page = buildPage(rows(10), 25, 10);
      expect(page.items).toHaveLength(10);
      expect(page.page.hasMore).toBe(false);
      expect(page.page.nextCursor).toBeNull();
    });

    it('handles an empty result', () => {
      const page = buildPage([], 25, 0);
      expect(page.items).toEqual([]);
      expect(page.page.nextCursor).toBeNull();
      expect(page.page.total).toBe(0);
    });
  });
});
