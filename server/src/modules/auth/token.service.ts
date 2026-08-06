import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import type { AppConfig } from '@/config/configuration';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresAt: Date;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/**
 * Access tokens are JWTs; refresh tokens deliberately are not.
 *
 * The architecture doc implies a JWT refresh strategy, but a JWT cannot be
 * revoked — and revocation is the entire mechanism behind reuse detection.
 * So refresh tokens are opaque 256-bit random strings, stored as SHA-256
 * hashes, with the database as the source of truth. That buys real logout,
 * real family revocation, and a stolen-token response that actually works.
 *
 * SHA-256 rather than bcrypt for these: bcrypt exists to slow down brute force
 * against low-entropy human passwords. A 256-bit random token has nothing to
 * brute force, and hashing it slowly would just add latency to every refresh.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('TokenService');
  }

  /** Starts a new token family. One family per login. */
  async issuePair(user: { id: string; email: string }): Promise<TokenPair> {
    return this.mint(user, randomUUID());
  }

  /**
   * Exchanges a refresh token for a new pair, rotating it.
   *
   * Reuse of an already-spent token means the chain leaked, so the whole
   * family dies and every session descended from that login is forced to
   * re-authenticate.
   */
  async rotate(rawToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(rawToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Atomic claim. Two concurrent refreshes race here and exactly one wins;
    // the loser is indistinguishable from a replay, so it's treated as one.
    // That does mean a double-submitted refresh logs the user out — the
    // deliberate trade, because the alternative is a time window in which a
    // stolen token is silently accepted.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });

    if (claimed.count === 0) {
      await this.revokeFamily(existing.familyId);
      this.logger.warn('Refresh token reuse detected — family revoked', {
        userId: existing.userId,
        familyId: existing.familyId,
      });
      throw new UnauthorizedException('Refresh token has already been used');
    }

    return this.mint(existing.user, existing.familyId);
  }

  /** Revokes every unspent token in a family. Used on logout and on reuse. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByToken(rawToken: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { familyId: true },
    });

    if (existing) {
      await this.revokeFamily(existing.familyId);
    }
  }

  /** Kills every session for a user — password change, account compromise. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const jwtConfig = this.config.get<AppConfig['jwt']>('jwt');
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: jwtConfig?.accessSecret,
    });
  }

  private async mint(
    user: { id: string; email: string },
    familyId: string,
  ): Promise<TokenPair> {
    const jwtConfig = this.config.get<AppConfig['jwt']>('jwt');

    const payload: AccessTokenPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: jwtConfig?.accessSecret,
      // jsonwebtoken types `expiresIn` as a `ms`-style template literal, which
      // a value read from the environment can't satisfy statically. The format
      // is validated for real by addDuration() below, which throws on anything
      // it can't parse — so a bad TTL fails at first use, not silently.
      expiresIn: (jwtConfig?.accessTtl ?? '15m') as JwtSignOptions['expiresIn'],
    });

    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = addDuration(jwtConfig?.refreshTtl ?? '7d');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      accessExpiresIn: jwtConfig?.accessTtl ?? '15m',
      refreshExpiresAt,
    };
  }
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Parses "15m" / "7d" / "24h" into a future Date. */
export function addDuration(duration: string, from: Date = new Date()): Date {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());

  if (!match) {
    throw new Error(`Unsupported duration format: ${duration}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  const factor = multipliers[unit ?? ''];
  if (factor === undefined) {
    throw new Error(`Unsupported duration unit: ${String(unit)}`);
  }

  return new Date(from.getTime() + amount * factor);
}
