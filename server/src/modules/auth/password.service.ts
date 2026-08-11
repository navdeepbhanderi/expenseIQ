import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/**
 * Isolates bcrypt behind one seam, so swapping to argon2id later touches one
 * file rather than every call site.
 */
@Injectable()
export class PasswordService {
  /**
   * Cost 12 - roughly 250ms on current hardware. High enough to make offline
   * cracking expensive, low enough that login doesn't feel broken and a burst
   * of logins can't pin the event loop.
   */
  private static readonly ROUNDS = 12;

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, PasswordService.ROUNDS);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Burns roughly the same time as a real verification, without a hash.
   *
   * Login must take the same time whether or not the email exists. Skipping
   * the hash when there's no user turns response latency into an account
   * enumeration oracle - the one thing the spec's "don't leak which emails
   * are registered" rule is trying to prevent, undone by a timing side channel.
   */
  async burnTime(): Promise<void> {
    await bcrypt.compare(
      'timing-equalisation',
      '$2b$12$Q1oQ0YyQ1oQ0YyQ1oQ0YyOJ8Xk5vJZ1oQ0YyQ1oQ0YyQ1oQ0YyQ1o',
    );
  }
}
