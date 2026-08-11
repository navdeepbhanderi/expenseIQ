/**
 * The password policy, mirrored from the server.
 *
 * This is a deliberate duplication of
 * `server/src/modules/auth/domain/password-policy.ts`, and the duplication has
 * to stay exact. A strength meter that says "Strong" and then watches the
 * server reject the password is worse than no meter at all - it teaches the
 * user that the app's feedback cannot be trusted, at the exact moment they are
 * deciding whether to trust it with their money.
 *
 * `lib/password.test.ts` pins the rules against the same cases the server's
 * own tests use. If the server's policy changes, that test should fail here.
 *
 * Note the design's caption on screen 7b - "Strong · 10+ characters with a
 * number" - is softer than the real rule, which also demands a special
 * character. The meter follows the server, not the caption.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** bcrypt reads only the first 72 bytes; beyond that, extra input is a lie. */
export const MAX_PASSWORD_BYTES = 72;

/**
 * "Password1!" satisfies every character-class rule ever written and is still
 * among the first things any attacker tries.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password1!",
  "password123",
  "qwerty123",
  "12345678",
  "letmein1!",
  "welcome1!",
  "admin123",
  "iloveyou1",
  "abc12345",
]);

export interface PasswordCheck {
  valid: boolean;
  failures: string[];
}

/** Byte length, because bcrypt truncates bytes - not character count. */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function checkPassword(password: string): PasswordCheck {
  const failures: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    failures.push(`At least ${MIN_PASSWORD_LENGTH} characters`);
  }

  // Emoji and Devanagari are multi-byte, so a 40-character password can
  // exceed the limit that a 40-character check would pass.
  if (byteLength(password) > MAX_PASSWORD_BYTES) {
    failures.push(`At most ${MAX_PASSWORD_BYTES} bytes`);
  }

  if (!/[0-9]/.test(password)) {
    failures.push("At least one number");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    failures.push("At least one special character");
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    failures.push("Too common - pick something less guessable");
  }

  return { valid: failures.length === 0, failures };
}

export type PasswordStrength = "weak" | "fair" | "strong";

/**
 * Strength for the meter, on top of validity.
 *
 * A password can be *valid* and still weak, so this reports both: the rules
 * list says what is required, the strength says how much margin there is. The
 * bar never shows "strong" for something the server would reject, because it
 * returns "weak" for anything invalid before considering length.
 */
export function passwordStrength(password: string): {
  strength: PasswordStrength;
  check: PasswordCheck;
  /** Human phrase for the caption, e.g. "Strong · 12 characters". */
  label: string;
} {
  const check = checkPassword(password);

  if (!check.valid) {
    return { strength: "weak", check, label: check.failures[0] ?? "Too weak" };
  }

  const varieties = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const strength: PasswordStrength =
    password.length >= 12 && varieties >= 3 ? "strong" : "fair";

  return {
    strength,
    check,
    label:
      strength === "strong"
        ? `Strong · ${password.length} characters`
        : `Good · ${password.length} characters`,
  };
}
