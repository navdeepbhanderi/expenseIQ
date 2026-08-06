import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

/**
 * Trims and lower-cases an email *before* validating it.
 *
 * Order matters. A bare `@IsEmail()` rejects "  Aarav@Example.com " outright,
 * because the surrounding whitespace makes it not-an-email — so a user who
 * pastes their address from a password manager or an email client gets told
 * it's invalid. Normalising first means validation sees what the user meant.
 *
 * Lower-casing also has to happen here rather than only in the service:
 * `User.email` is uniquely indexed, so "Aarav@..." and "aarav@..." would
 * otherwise be two different accounts.
 */
export function NormalisedEmail(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }): unknown =>
      typeof value === 'string' ? value.trim().toLowerCase() : value,
    ),
    IsEmail({}, { message: 'A valid email address is required' }),
  );
}
