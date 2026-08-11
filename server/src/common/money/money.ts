/**
 * Money - integer minor units (paise), never float, never Prisma Decimal.
 *
 * Why this exists at all:
 *
 *   0.1 + 0.2 === 0.30000000000000004
 *
 * Any ledger that adds floats eventually disagrees with itself. Prisma's
 * `Decimal` avoids that but deserializes to an object that loses precision the
 * moment it crosses a JSON boundary, which it does on every API response. So
 * amounts are stored as Postgres `bigint` paise, wrapped by this class in the
 * domain, and exposed to clients as an integer `amountMinor`.
 *
 * Formatting (₹, lakh/crore grouping) is deliberately NOT here - that is a
 * presentation concern and lives in the client.
 */

export type Currency = 'INR';

export type Rounding = 'half-up' | 'floor' | 'ceil';

const MINOR_UNITS_PER_MAJOR = 100;

export class MoneyError extends Error {}

export class Money {
  private constructor(
    /** Integer minor units. Negative means outflow. */
    readonly minor: number,
    readonly currency: Currency,
  ) {}

  // ─── Construction ──────────────────────────────────────────────────────────

  static fromMinor(minor: number, currency: Currency = 'INR'): Money {
    if (!Number.isInteger(minor)) {
      throw new MoneyError(`Minor units must be an integer, got ${minor}`);
    }
    Money.assertSafe(minor);
    return new Money(minor, currency);
  }

  /** From rupees. Accepts fractional input and rounds to the nearest paisa. */
  static fromMajor(
    major: number,
    currency: Currency = 'INR',
    rounding: Rounding = 'half-up',
  ): Money {
    if (!Number.isFinite(major)) {
      throw new MoneyError(`Major units must be finite, got ${major}`);
    }
    return new Money(round(major * MINOR_UNITS_PER_MAJOR, rounding), currency);
  }

  /**
   * From a Prisma `BigInt` column. Asserts the value survives the conversion
   * to `number` - at 2^53 paise that is ₹90 trillion, so this should never
   * fire in practice, but a silent precision loss on money is unacceptable.
   */
  static fromBigInt(value: bigint, currency: Currency = 'INR'): Money {
    if (
      value > BigInt(Number.MAX_SAFE_INTEGER) ||
      value < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new MoneyError(
        `Amount ${value} exceeds the safe integer range and cannot be ` +
          `represented without precision loss`,
      );
    }
    return new Money(Number(value), currency);
  }

  static zero(currency: Currency = 'INR'): Money {
    return new Money(0, currency);
  }

  /** Sums a list. Returns zero in `currency` when the list is empty. */
  static sum(items: readonly Money[], currency: Currency = 'INR'): Money {
    return items.reduce<Money>(
      (acc, item) => acc.add(item),
      Money.zero(currency),
    );
  }

  // ─── Arithmetic ────────────────────────────────────────────────────────────

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.minor - other.minor, this.currency);
  }

  /**
   * Scales by a factor, rounding once at the end.
   *
   * The factor may be fractional (an interest rate, a percentage). Rounding
   * happens exactly once, here - callers must never chain multiplications and
   * round at each step, because that accumulates drift.
   */
  multiply(factor: number, rounding: Rounding = 'half-up'): Money {
    if (!Number.isFinite(factor)) {
      throw new MoneyError(`Factor must be finite, got ${factor}`);
    }
    return Money.fromMinor(round(this.minor * factor, rounding), this.currency);
  }

  negate(): Money {
    return Money.fromMinor(-this.minor, this.currency);
  }

  abs(): Money {
    return Money.fromMinor(Math.abs(this.minor), this.currency);
  }

  /**
   * Splits across weighted buckets without losing or inventing a single paisa.
   *
   * Naive proportional splitting leaks money: ₹10 into three equal parts gives
   * 333 + 333 + 333 = 999 paise, one short. This distributes the remainder to
   * the largest fractional parts (largest-remainder method), so the parts
   * always sum back to the original exactly.
   */
  allocate(weights: readonly number[]): Money[] {
    if (weights.length === 0) {
      throw new MoneyError('Cannot allocate across zero buckets');
    }
    if (weights.some((w) => w < 0)) {
      throw new MoneyError('Allocation weights must be non-negative');
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) {
      throw new MoneyError('Allocation weights must not sum to zero');
    }

    const exact = weights.map((w) => (this.minor * w) / totalWeight);
    const floors = exact.map((v) => Math.floor(v));
    let remainder = this.minor - floors.reduce((a, b) => a + b, 0);

    // Hand out the leftover paise to whichever buckets were cut hardest.
    const order = exact
      .map((value, index) => ({ index, frac: value - Math.floor(value) }))
      .sort((a, b) => b.frac - a.frac);

    const result = [...floors];
    for (const { index } of order) {
      if (remainder === 0) break;
      const step = remainder > 0 ? 1 : -1;
      result[index] = (result[index] ?? 0) + step;
      remainder -= step;
    }

    return result.map((minor) => Money.fromMinor(minor, this.currency));
  }

  /** `percent` is a whole percentage - `percentOf(30)` is 30%, not 0.3. */
  percentOf(percent: number, rounding: Rounding = 'half-up'): Money {
    return this.multiply(percent / 100, rounding);
  }

  /**
   * This amount as a percentage of `total`, as a float.
   * Returns 0 rather than NaN/Infinity when `total` is zero - callers are
   * rendering progress bars ("12% of ₹2,00,000 used") and a zero-limit card
   * should read as 0%, not blow up the response.
   */
  ratioOf(total: Money): number {
    this.assertSameCurrency(total);
    if (total.minor === 0) return 0;

    // Normalised through 12 significant digits because the raw division
    // produces artefacts - ₹1,12,000 of a ₹1,00,000 budget is exactly 112%,
    // but the float says 112.00000000000001, and that reaches the UI.
    // Twelve digits is far more precision than any percentage needs and far
    // less than float64's ~15-17, so it only ever removes noise.
    return Number(((this.minor / total.minor) * 100).toPrecision(12));
  }

  // ─── Comparison ────────────────────────────────────────────────────────────

  equals(other: Money): boolean {
    return this.minor === other.minor && sameCurrency(this, other);
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor < other.minor;
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minor > other.minor;
  }

  get isZero(): boolean {
    return this.minor === 0;
  }

  get isNegative(): boolean {
    return this.minor < 0;
  }

  get isPositive(): boolean {
    return this.minor > 0;
  }

  // ─── Conversion ────────────────────────────────────────────────────────────

  /** Rupees as a float. For display and ratios only - never for arithmetic. */
  toMajor(): number {
    return this.minor / MINOR_UNITS_PER_MAJOR;
  }

  toBigInt(): bigint {
    return BigInt(this.minor);
  }

  /** The wire shape every API response uses for an amount. */
  toJSON(): { amountMinor: number; currency: Currency } {
    return { amountMinor: this.minor, currency: this.currency };
  }

  toString(): string {
    return `${this.currency} ${this.toMajor().toFixed(2)}`;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private assertSameCurrency(other: Money): void {
    if (!sameCurrency(this, other)) {
      throw new MoneyError(
        `Currency mismatch: ${String(this.currency)} vs ${String(other.currency)}`,
      );
    }
  }

  private static assertSafe(minor: number): void {
    if (!Number.isSafeInteger(minor)) {
      throw new MoneyError(`Amount ${minor} is outside the safe integer range`);
    }
  }
}

/**
 * Compares currencies through `string`, deliberately.
 *
 * `Currency` is a single-member union today, so the type checker considers
 * `a.currency !== b.currency` statically impossible and flags the guard as
 * dead code. It isn't: `Account.currency` and `Transaction.currency` are plain
 * `String` columns in Postgres, so a value read back through Prisma and
 * asserted into `Currency` can be anything the database happens to hold.
 * Widening here keeps the runtime check honest, and it stops being a
 * formality the moment a second currency is added.
 */
function sameCurrency(a: Money, b: Money): boolean {
  return (a.currency as string) === (b.currency as string);
}

/**
 * Rounds a possibly-fractional minor-unit value to an integer.
 *
 * Two traps handled here:
 *
 * 1. Binary representation error. `1.005 * 100` is actually
 *    `100.49999999999999`, so a naive half-up rounds it *down* to 100 when
 *    ₹1.005 clearly ought to be 101 paise. Normalising through 15 significant
 *    digits - comfortably inside float64's ~15–17 digits of real precision -
 *    collapses that error before the rounding decision is made.
 *
 * 2. Negative ties. Finance rounds half *away from zero*, so −2.5 → −3.
 *    `Math.round(-2.5)` returns −2, so negatives are mirrored explicitly.
 */
function round(value: number, mode: Rounding): number {
  const normalised = Number(value.toPrecision(15));

  switch (mode) {
    case 'floor':
      return Math.floor(normalised);
    case 'ceil':
      return Math.ceil(normalised);
    case 'half-up':
      return normalised < 0 ? -Math.round(-normalised) : Math.round(normalised);
  }
}
