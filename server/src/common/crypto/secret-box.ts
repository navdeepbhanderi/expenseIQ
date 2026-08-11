import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Encrypts a secret at rest.
 *
 * **What this does and does not promise.**
 *
 * It is honest to say the key is encrypted at rest, never returned by any
 * endpoint, and never logged. It would *not* be honest to say nobody can read
 * it: the server has to decrypt it to call the provider, so anyone with both
 * the database and `CREDENTIAL_ENCRYPTION_KEY` can recover it. Real
 * zero-knowledge would mean the browser holding the key and calling the
 * provider directly, which is a different product - the key would then sit in
 * the user's local storage, exposed to any XSS, and server-side parsing would
 * stop working. The UI says exactly this rather than implying more.
 *
 * What encryption at rest actually buys, and why it is worth doing: a leaked
 * database dump, a stray backup, a misconfigured replica or a `SELECT *` in a
 * support tool yields ciphertext instead of live API keys.
 *
 * AES-256-GCM rather than CBC because it authenticates as well as encrypts.
 * Without the auth tag, ciphertext could be altered undetectably and would
 * decrypt to a different key - silently sending a user's requests somewhere
 * they did not choose.
 */

const ALGORITHM = 'aes-256-gcm';

/** 96 bits, the size GCM is specified for and fastest with. */
const IV_BYTES = 12;

export interface SealedSecret {
  /** Base64 ciphertext. */
  ciphertext: string;
  /** Base64 nonce. Unique per encryption - reuse under GCM is catastrophic. */
  iv: string;
  /** Base64 GCM authentication tag. */
  authTag: string;
}

export class SecretBoxError extends Error {}

/**
 * Derives the 32-byte key from the configured secret.
 *
 * Requires a 64-character hex string rather than accepting any passphrase and
 * hashing it: a hashed passphrase looks like it works while providing whatever
 * entropy the passphrase had, and "encrypted with `password123`" is worse than
 * not claiming encryption at all. Generate one with:
 *
 *     openssl rand -hex 32
 */
export function keyFrom(secret: string | undefined): Buffer {
  if (!secret) {
    throw new SecretBoxError('CREDENTIAL_ENCRYPTION_KEY is not configured');
  }

  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new SecretBoxError(
      'CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters - generate one with `openssl rand -hex 32`',
    );
  }

  return Buffer.from(secret, 'hex');
}

export function seal(plaintext: string, key: Buffer): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function open(sealed: SealedSecret, key: Buffer): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(sealed.iv, 'base64'),
  );

  decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    /*
     * Deliberately opaque.
     *
     * final() throws when the tag does not verify, which means the row was
     * tampered with or the encryption key has changed. Distinguishing those
     * in the message would tell an attacker which one they achieved, and the
     * remedy is the same either way: the user re-enters their key.
     */
    throw new SecretBoxError('Stored credential could not be decrypted');
  }
}

/**
 * The last four characters, for showing which key is stored.
 *
 * Four is enough for someone to recognise their own key and not enough to
 * help anyone guess it. The prefix is included because every provider uses a
 * distinctive one ("gsk_", "sk-or-v1-") and seeing it confirms the right kind
 * of key went in.
 */
export function hint(plaintext: string): string {
  const tail = plaintext.slice(-4);
  const prefix = /^([a-z]{2,6}[-_])/i.exec(plaintext)?.[1] ?? '';
  return `${prefix}…${tail}`;
}

/** Constant-time compare, for anywhere a secret is checked rather than used. */
export function matches(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
