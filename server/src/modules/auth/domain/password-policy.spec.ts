import {
  checkPassword,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from './password-policy';

describe('password policy', () => {
  it('accepts a password meeting the spec', () => {
    expect(checkPassword('Kirana@2026').valid).toBe(true);
  });

  it('enforces the spec: length, a number, a special character', () => {
    expect(checkPassword('short1!').failures).toContain(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    expect(checkPassword('nonumbers!').failures).toContain(
      'Password must contain at least one number',
    );
    expect(checkPassword('nospecial123').failures).toContain(
      'Password must contain at least one special character',
    );
  });

  it('rejects passwords past bcrypt`s 72-byte truncation point', () => {
    // Beyond 72 bytes bcrypt ignores the rest, so two different long
    // passwords can hash identically - a user typing 80 characters would get
    // less security than they believe they're buying.
    const tooLong = 'a1!'.repeat(30);
    expect(Buffer.byteLength(tooLong)).toBeGreaterThan(MAX_PASSWORD_BYTES);
    expect(checkPassword(tooLong).failures).toContain(
      `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
    );
  });

  it('counts bytes, not characters, for the upper bound', () => {
    // Devanagari is three bytes per character, so 30 characters is 90 bytes -
    // over the limit despite looking short.
    const devanagari = 'क'.repeat(30) + '1!';
    expect(devanagari.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(checkPassword(devanagari).failures).toContain(
      `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
    );
  });

  it('rejects common passwords that satisfy every character-class rule', () => {
    const result = checkPassword('Password1!');
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('Password is too common');
  });

  it('reports every failure at once rather than one at a time', () => {
    // A form that reveals one rule per submit is a miserable way to sign up.
    expect(checkPassword('abc').failures.length).toBeGreaterThanOrEqual(3);
  });
});
