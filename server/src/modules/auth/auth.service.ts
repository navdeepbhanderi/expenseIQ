import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { ProfileKind, type User } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { MailerService } from '@/infra/mailer/mailer.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import { ProfilesService } from '@/modules/profiles/profiles.service';
import type { AppConfig } from '@/config/configuration';

import { PasswordService } from './password.service';
import { TokenService, addDuration, type TokenPair } from './token.service';
import { checkPassword } from './domain/password-policy';
import type { LoginDto, SignupDto } from './dto/auth.dto';

/** Verification links live for 24 hours, per the feature spec. */
const VERIFICATION_TTL = '24h';

export interface AuthResult {
  user: { id: string; email: string; displayName: string | null };
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly profiles: ProfilesService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('AuthService');
  }

  /**
   * Signup always reports success, whether or not the email was already taken.
   *
   * The spec requires not leaking which addresses are registered. That means
   * the duplicate case must be indistinguishable from the new-account case —
   * so an existing user gets no new account and no new verification mail, and
   * the caller sees the same response either way.
   */
  async signup(dto: SignupDto): Promise<{ message: string }> {
    const policy = checkPassword(dto.password);
    if (!policy.valid) {
      throw new BadRequestException({
        message: 'Password does not meet requirements',
        details: policy.failures,
      });
    }

    const email = normaliseEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      this.logger.log('Signup attempted for an existing address', {
        userId: existing.id,
      });
      return { message: GENERIC_SIGNUP_MESSAGE };
    }

    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: dto.displayName ?? null,
        emailVerified: false,
      },
    });

    // The default profile is created immediately, so the moment the user
    // verifies they have somewhere to put money. Its monogram comes from
    // their name rather than the word "Personal" — design 2c shows AR for
    // Aarav's profile named "Personal".
    await this.profiles.create(
      user.id,
      { name: 'Personal', kind: ProfileKind.PERSONAL },
      { isDefault: true, initialsSeed: dto.displayName ?? email },
    );

    await this.sendVerificationEmail(user);

    return { message: GENERIC_SIGNUP_MESSAGE };
  }

  async resendVerification(rawEmail: string): Promise<{ message: string }> {
    const email = normaliseEmail(rawEmail);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && !user.emailVerified) {
      await this.sendVerificationEmail(user);
    }

    // Same response regardless — an unverified, verified and non-existent
    // address must be indistinguishable from outside.
    return { message: GENERIC_SIGNUP_MESSAGE };
  }

  async verifyEmail(rawToken: string): Promise<{ message: string }> {
    const tokenHash = hashToken(rawToken);

    const record = await this.prisma.emailVerification.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.consumedAt) {
      throw new BadRequestException(
        'Verification link is invalid or already used',
      );
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        message: 'Verification link has expired',
        details: { canResend: true },
      });
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
      }),
    ]);

    return { message: 'Email verified. You can now sign in.' };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = normaliseEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user?.passwordHash) {
      // Burn comparable time so response latency doesn't reveal whether the
      // account exists — otherwise the careful generic error message above is
      // undone by a stopwatch.
      await this.passwords.burnTime();
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await this.passwords.verify(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerified) {
      // Distinct from bad credentials on purpose: the caller has already
      // proven they own the password, so telling them to check their inbox
      // leaks nothing and is the only actionable message.
      throw new ForbiddenException({
        message: 'Please verify your email address',
        details: { canResend: true },
      });
    }

    const tokens = await this.tokens.issuePair(user);

    return { user: publicUser(user), tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string | undefined): Promise<{ message: string }> {
    if (refreshToken) {
      await this.tokens.revokeByToken(refreshToken);
    }
    return { message: 'Signed out' };
  }

  /**
   * Google sign-in, covering the three cases from the spec.
   *
   * Linking by verified email is the subtle one: it's what stops a user who
   * signed up with a password from being handed a second, separate account
   * the first time they click "Continue with Google". The `emailVerified`
   * requirement is load-bearing — linking on an unverified address would let
   * someone claim an account by signing up with an email they don't own and
   * waiting for the real owner to use Google.
   */
  async loginWithGoogle(profile: {
    googleId: string;
    email: string;
    displayName?: string;
  }): Promise<AuthResult> {
    const email = normaliseEmail(profile.email);

    const byGoogleId = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (byGoogleId) {
      const tokens = await this.tokens.issuePair(byGoogleId);
      return { user: publicUser(byGoogleId), tokens };
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email } });

    if (byEmail) {
      if (!byEmail.emailVerified) {
        throw new ForbiddenException(
          'An unverified account already exists for this address. ' +
            'Verify it by email first, then link Google.',
        );
      }

      const linked = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          displayName: byEmail.displayName ?? profile.displayName ?? null,
        },
      });

      this.logger.log('Linked Google identity to existing account', {
        userId: linked.id,
      });

      const tokens = await this.tokens.issuePair(linked);
      return { user: publicUser(linked), tokens };
    }

    // Google has already verified the address, so there's nothing for us to
    // verify — the account starts active.
    const created = await this.prisma.user.create({
      data: {
        email,
        googleId: profile.googleId,
        displayName: profile.displayName ?? null,
        emailVerified: true,
      },
    });

    await this.profiles.create(
      created.id,
      { name: 'Personal', kind: ProfileKind.PERSONAL },
      { isDefault: true, initialsSeed: profile.displayName ?? email },
    );

    const tokens = await this.tokens.issuePair(created);
    return { user: publicUser(created), tokens };
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async sendVerificationEmail(user: User): Promise<void> {
    // Any outstanding link is invalidated first, so a resend leaves exactly
    // one usable token rather than a growing set of valid ones.
    await this.prisma.emailVerification.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('base64url');

    await this.prisma.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: addDuration(VERIFICATION_TTL),
      },
    });

    const webUrl = this.config.get<AppConfig['webUrl']>('webUrl');
    const link = `${webUrl ?? ''}/verify-email?token=${rawToken}`;

    await this.mailer.send({
      to: user.email,
      subject: 'Verify your ExpenseIQ email',
      text:
        `Welcome to ExpenseIQ.\n\n` +
        `Confirm your email address to finish setting up your account:\n` +
        `${link}\n\n` +
        `This link expires in 24 hours. If you didn't sign up, ignore this email.`,
    });
  }
}

const GENERIC_SIGNUP_MESSAGE =
  'If that address can be registered, a verification email is on its way.';

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function publicUser(user: User): AuthResult['user'] {
  return { id: user.id, email: user.email, displayName: user.displayName };
}
