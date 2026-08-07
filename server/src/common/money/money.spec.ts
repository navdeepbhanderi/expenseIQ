import { Money, MoneyError } from './money';

describe('Money', () => {
  describe('construction', () => {
    it('rejects non-integer minor units', () => {
      expect(() => Money.fromMinor(10.5)).toThrow(MoneyError);
    });

    it('converts rupees to paise', () => {
      expect(Money.fromMajor(300).minor).toBe(30_000);
      expect(Money.fromMajor(2140.5).minor).toBe(214_050);
    });

    it('rounds half away from zero, defeating binary representation error', () => {
      // 1.005 * 100 is literally 100.49999999999999 in float64.
      expect(Money.fromMajor(1.005).minor).toBe(101);
      expect(Money.fromMajor(2.675).minor).toBe(268);
      expect(Money.fromMajor(-1.005).minor).toBe(-101);
    });

    it('round-trips through bigint', () => {
      const original = Money.fromMajor(1_24_860);
      expect(Money.fromBigInt(original.toBigInt()).equals(original)).toBe(true);
    });

    it('refuses a bigint that would silently lose precision', () => {
      expect(() =>
        Money.fromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + 10n),
      ).toThrow(MoneyError);
    });
  });

  describe('arithmetic', () => {
    it('adds without float drift', () => {
      // The canonical 0.1 + 0.2 !== 0.3 case, in money terms.
      const result = Money.fromMajor(0.1).add(Money.fromMajor(0.2));
      expect(result.minor).toBe(30);
      expect(result.toMajor()).toBe(0.3);
    });

    it('sums a long list exactly', () => {
      const items = Array.from({ length: 1000 }, () => Money.fromMajor(0.01));
      expect(Money.sum(items).minor).toBe(1000);
    });

    it('scales by a fractional factor, rounding once', () => {
      // 8.4% annual → monthly, applied to ₹38,42,000 outstanding.
      // 38,42,000 × 0.007 = ₹26,894 of interest in the first month.
      const outstanding = Money.fromMajor(38_42_000);
      expect(outstanding.multiply(0.084 / 12).toMajor()).toBe(26_894);
    });

    it('computes a whole-number percentage', () => {
      expect(Money.fromMajor(2_00_000).percentOf(12).toMajor()).toBe(24_000);
    });

    it('reports a ratio for progress bars', () => {
      const outstanding = Money.fromMajor(23_480);
      const limit = Money.fromMajor(2_00_000);
      expect(outstanding.ratioOf(limit)).toBeCloseTo(11.74, 2);
    });

    it('treats a ratio against zero as 0%, not NaN', () => {
      expect(Money.fromMajor(100).ratioOf(Money.zero())).toBe(0);
    });

    it('returns a clean percentage, free of float artefacts', () => {
      // The raw division gives 112.00000000000001, which would reach the UI.
      expect(Money.fromMajor(1_12_000).ratioOf(Money.fromMajor(1_00_000))).toBe(
        112,
      );
      expect(Money.fromMajor(1).ratioOf(Money.fromMajor(3))).toBeCloseTo(
        33.3333,
        4,
      );
    });
  });

  describe('allocate', () => {
    it('conserves every paisa on an uneven split', () => {
      // The classic: ₹10 three ways is 333 + 333 + 334, never 333 × 3.
      const parts = Money.fromMajor(10).allocate([1, 1, 1]);
      expect(parts.map((p) => p.minor)).toEqual([334, 333, 333]);
      expect(Money.sum(parts).minor).toBe(1000);
    });

    it('conserves across weighted buckets', () => {
      const parts = Money.fromMajor(64_210).allocate([18_420, 15_600, 9_180]);
      expect(Money.sum(parts).equals(Money.fromMajor(64_210))).toBe(true);
    });

    it('conserves for negative totals', () => {
      const parts = Money.fromMajor(-10).allocate([1, 1, 1]);
      expect(Money.sum(parts).minor).toBe(-1000);
    });

    it('rejects a degenerate split', () => {
      expect(() => Money.fromMajor(10).allocate([])).toThrow(MoneyError);
      expect(() => Money.fromMajor(10).allocate([0, 0])).toThrow(MoneyError);
    });
  });

  describe('currency safety', () => {
    it('refuses to mix currencies', () => {
      const inr = Money.fromMajor(100, 'INR');
      const fake = Money.fromMinor(100, 'USD' as 'INR');
      expect(() => inr.add(fake)).toThrow(MoneyError);
    });
  });

  describe('serialisation', () => {
    it('survives a JSON round trip with no precision loss', () => {
      const original = Money.fromMajor(1_24_860.55);
      const revived = Money.fromMinor(
        JSON.parse(JSON.stringify(original)).amountMinor,
      );
      expect(revived.equals(original)).toBe(true);
    });

    it('emits the wire shape the API contract promises', () => {
      expect(Money.fromMajor(300).toJSON()).toEqual({
        amountMinor: 30_000,
        currency: 'INR',
      });
    });
  });
});
