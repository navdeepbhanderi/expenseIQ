import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '@/infra/prisma/prisma.service';
import type { AppConfig } from '@/config/configuration';
import type { AccessTokenPayload } from '../token.service';
import type { AuthenticatedUser } from '@/common/types/express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const jwt = config.get<AppConfig['jwt']>('jwt');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwt?.accessSecret ?? '',
    });
  }

  /**
   * Re-reads the user on every request rather than trusting the claims alone.
   *
   * The token is signed, so its contents are authentic - but they're a
   * snapshot from up to 15 minutes ago. A deleted account or an email that
   * has since been unverified would otherwise keep working until expiry.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email address is not verified');
    }

    return { id: user.id, email: user.email };
  }
}
