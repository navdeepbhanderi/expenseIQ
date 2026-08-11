import { randomBytes } from 'node:crypto';
import { hint, keyFrom, open, seal, SecretBoxError } from './secret-box';

const KEY = keyFrom(randomBytes(32).toString('hex'));
const SECRET = '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';

describe('keyFrom', () => {
  it('refuses a passphrase', () => {
    /*
     * Hashing whatever the operator typed would look like it works while
     * providing only the entropy of the passphrase. "Encrypted with
     * password123" is worse than not claiming encryption at all.
     */
    expect(() => keyFrom('password123')).toThrow(SecretBoxError);
    expect(() => keyFrom('')).toThrow(SecretBoxError);
    expect(() => keyFrom(undefined)).toThrow(SecretBoxError);
  });

  it('accepts 64 hex characters', () => {
    expect(keyFrom(randomBytes(32).toString('hex'))).toHaveLength(32);
  });
});

describe('seal and open', () => {
  it('round-trips', () => {
    expect(open(seal(SECRET, KEY), KEY)).toBe(SECRET);
  });

  it('produces different ciphertext each time', () => {
    // A reused nonce under GCM leaks the plaintext relationship and breaks
    // the authentication entirely, so this is the property that matters most.
    const a = seal(SECRET, KEY);
    const b = seal(SECRET, KEY);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('refuses ciphertext that has been altered', () => {
    const sealed = seal(SECRET, KEY);
    const bytes = Buffer.from(sealed.ciphertext, 'base64');
    bytes[0] = (bytes[0]! ^ 0xff) & 0xff;

    // Without authentication this would decrypt to a *different* key, and the
    // user's requests would silently go somewhere they never chose.
    expect(() =>
      open({ ...sealed, ciphertext: bytes.toString('base64') }, KEY),
    ).toThrow(SecretBoxError);
  });

  it('refuses a swapped auth tag', () => {
    const sealed = seal(SECRET, KEY);
    const other = seal('something else', KEY);
    expect(() => open({ ...sealed, authTag: other.authTag }, KEY)).toThrow(
      SecretBoxError,
    );
  });

  it('refuses the wrong key', () => {
    const other = keyFrom(randomBytes(32).toString('hex'));
    expect(() => open(seal(SECRET, KEY), other)).toThrow(SecretBoxError);
  });

  it('does not leak the plaintext into the stored fields', () => {
    const sealed = seal(SECRET, KEY);
    const serialised = JSON.stringify(sealed);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain('RoisNCwF');
  });
});

describe('hint', () => {
  it('shows the provider prefix and the last four', () => {
    // Enough for someone to recognise their own key, not enough to guess it.
    expect(hint(SECRET)).toBe('gsk_…NCwF');
    expect(hint('sk-or-v1-abcdefghijkl')).toBe('sk-…ijkl');
  });

  it('reveals almost nothing of a long key', () => {
    expect(hint(SECRET).length).toBeLessThan(12);
  });
});
