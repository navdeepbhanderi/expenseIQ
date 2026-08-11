/**
 * Teaches JSON.stringify how to emit a BigInt.
 *
 * Every money column is a Postgres bigint, and `JSON.stringify(1n)` throws
 * `TypeError: Do not know how to serialize a BigInt`. Without this patch the
 * first response carrying an amount 500s.
 *
 * This lives in its own module, imported for its side effect by AppModule,
 * rather than sitting at the top of main.ts - otherwise it applies only when
 * the app is booted through main.ts, and every other entry point (tests,
 * scripts, queue workers) inherits the crash.
 *
 * Amounts go out as JSON numbers rather than strings. The largest value
 * representable is 2^53 paise - roughly ₹90 trillion - so nothing realistic
 * loses precision, and a number spares every client from parsing amounts by
 * hand. Anything beyond that range throws rather than silently rounding.
 */
export function installBigIntSerializer(): void {
  const proto = BigInt.prototype as unknown as { toJSON?: () => number };

  if (proto.toJSON) return;

  proto.toJSON = function toJSON(this: bigint): number {
    if (
      this > BigInt(Number.MAX_SAFE_INTEGER) ||
      this < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new TypeError(
        `BigInt ${this} exceeds the safe integer range and cannot be ` +
          `serialised without precision loss`,
      );
    }
    return Number(this);
  };
}

installBigIntSerializer();
