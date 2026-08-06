/**
 * Password rules, as pure functions.
 *
 * The feature spec sets the bar: minimum 8 characters, at least one number,
 * at least one special character. Two additions on top of that, both cheap
 * and both catching real-world weakness the character-class rules miss:
 *
 *   - an upper bound, because bcrypt silently truncates at 72 bytes. Without
 *     it, two different long passwords can hash identically and a user who
 *     types 80 characters gets less security than they think they're buying.
 *   - a small denylist, because "Password1!" satisfies every character-class
 *     rule ever written and is still one of the first things any attacker tries.
 */

export interface PasswordCheck {
  valid: boolean;
  failures: string[];
}

/** bcrypt only reads the first 72 bytes of input. */
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 8;

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password1!',
  'password123',
  'qwerty123',
  '12345678',
  'letmein1!',
  'welcome1!',
  'admin123',
  'iloveyou1',
  'abc12345',
]);

export function checkPassword(password: string): PasswordCheck {
  const failures: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    failures.push(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  // Byte length, not character length: emoji and Devanagari are multi-byte,
  // and it's bytes that bcrypt truncates.
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    failures.push(`Password must be at most ${MAX_PASSWORD_BYTES} bytes`);
  }

  if (!/[0-9]/.test(password)) {
    failures.push('Password must contain at least one number');
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    failures.push('Password must contain at least one special character');
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    failures.push('Password is too common');
  }

  return { valid: failures.length === 0, failures };
}
