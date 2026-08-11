/**
 * Redaction happens here, at the logger boundary - not at each call site.
 *
 * The architecture doc is explicit about this and it's the right call: if
 * redaction is the caller's job, one forgotten `logger.debug(req.body)` during
 * a late-night debugging session puts a password in the log file forever.
 * Making it structural means the unsafe thing is not available to do.
 */

const SENSITIVE_KEY_PATTERN =
  /pass(word)?|secret|token|authorization|cookie|apikey|api_key|credential|otp|pin|cvv|refresh|jwt|bearer/i;

/** Account numbers and card digits get masked rather than dropped entirely. */
const PARTIAL_KEY_PATTERN =
  /accountnumber|account_number|cardnumber|card_number|last4|iban/i;

export const REDACTED = '[redacted]';

/**
 * Deep-clones a value with sensitive fields removed.
 *
 * Cycles are tracked because request/response objects are full of them and a
 * naive walk would blow the stack in the middle of writing an error log - the
 * exact moment logging must not fail.
 */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = REDACTED;
    } else if (PARTIAL_KEY_PATTERN.test(key) && typeof item === 'string') {
      result[key] = maskAllButLast(item, 4);
    } else if (typeof item === 'bigint') {
      // BigInt has no JSON representation and would throw on stringify.
      result[key] = item.toString();
    } else {
      result[key] = redact(item, seen);
    }
  }

  return result;
}

function maskAllButLast(value: string, keep: number): string {
  if (value.length <= keep) return value;
  return '*'.repeat(value.length - keep) + value.slice(-keep);
}
