import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  type Profile,
  type VerifyCallback,
} from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '@/config/configuration';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  displayName?: string;
}

/**
 * Registered only when Google credentials are configured — see auth.module.ts.
 *
 * passport-google-oauth20 throws at construction if clientID is missing, so an
 * unconditional registration would make the whole app refuse to boot for
 * anyone who hasn't set up a Google Cloud project. Phases 2–5 have no reason
 * to need one.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const google = config.get<AppConfig['google']>('google');
    const appUrl = config.get<AppConfig['appUrl']>('appUrl');

    super({
      clientID: google?.clientId ?? '',
      clientSecret: google?.clientSecret ?? '',
      callbackURL: `${appUrl ?? ''}/api/v1/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      done(new Error('Google account has no email address'));
      return;
    }

    const identity: GoogleIdentity = {
      googleId: profile.id,
      email,
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
    };

    // Cast because what passes through here is a *pre-authentication
    // identity*, not an authenticated user — at this point in the flow the
    // account may not exist yet, so it has no id. Passport's contract is that
    // done()'s value lands on `req.user`, so the callback controller reads it
    // from there and immediately exchanges it for a real user via
    // AuthService.loginWithGoogle(). It is never seen by any other route.
    done(null, identity as unknown as Express.User);
  }
}
