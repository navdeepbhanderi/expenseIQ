import {
  Controller,
  ForbiddenException,
  Get,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Public } from '@/common/decorators/public.decorator';
import { AppLogger } from '@/common/logger/app-logger.service';
import type { AppConfig } from '@/config/configuration';

import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import type { GoogleIdentity } from './strategies/google.strategy';
import type { TokenPair } from './token.service';

/** Must match auth.controller.ts — the same cookie serves both flows. */
const REFRESH_COOKIE = 'eiq_refresh';

/**
 * Google OAuth lives in its own controller because its routes are browser
 * redirects rather than JSON endpoints — different shape, different error
 * handling, and they must not inherit the JSON controller's throttle.
 */
@ApiTags('auth')
@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('GoogleAuth');
  }

  @Public()
  @Get()
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Begin the Google OAuth flow',
    description:
      'Redirects to Google. Returns 501 if this server has no Google ' +
      'credentials configured.',
  })
  start(): void {
    // The guard redirects to Google before this runs. It exists so the route
    // is registered and can answer honestly when Google is switched off.
  }

  @Public()
  @Get('callback')
  @UseGuards(GoogleAuthGuard)
  @ApiExcludeEndpoint()
  async callback(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const webUrl = this.config.get<AppConfig['webUrl']>('webUrl') ?? '';
    const identity = request.user as unknown as GoogleIdentity;

    let result: Awaited<ReturnType<AuthService['loginWithGoogle']>>;

    /*
     * This route ends in a browser, not a fetch, so a thrown exception would
     * render the API's JSON error envelope as a bare page — which is what a
     * user actually saw: a wall of {"statusCode":403,...} where a sign-in
     * screen should have been.
     *
     * Every failure therefore redirects back to the app with a machine-
     * readable reason in the fragment, and the UI decides how to say it. The
     * reason is a short code rather than the message so the client can route
     * on it (an unverified account belongs on the verify screen, not on a
     * generic error), and so the copy stays in one place.
     */
    try {
      result = await this.auth.loginWithGoogle(identity);
    } catch (error) {
      const reason =
        error instanceof ForbiddenException ? 'unverified' : 'failed';

      this.logger.warn('Google sign-in rejected', {
        reason,
        email: identity.email,
      });

      response.redirect(
        `${webUrl}/auth/callback#error=${reason}` +
          `&email=${encodeURIComponent(identity.email)}`,
      );
      return;
    }

    /*
     * The refresh cookie has to be set here too.
     *
     * Without it a Google user gets a 15-minute access token and nothing to
     * renew it with: their session dies mid-use and cannot survive a reload,
     * while a password user's does. The redirect carries only the short-lived
     * access token; the long-lived one stays httpOnly, exactly as it does for
     * the password flow.
     */
    this.setRefreshCookie(response, result.tokens);

    // The access token goes in the URL fragment, not the query string:
    // fragments are never sent to a server, so it stays out of access logs,
    // proxy logs and the Referer header of whatever the page loads next.
    response.redirect(
      `${webUrl}/auth/callback#accessToken=${encodeURIComponent(
        result.tokens.accessToken,
      )}`,
    );
  }

  private setRefreshCookie(response: Response, tokens: TokenPair): void {
    // Mirrors auth.controller.ts — a readable hint that a session exists.
    response.cookie('eiq_session', '1', {
      httpOnly: false,
      secure:
        this.config.get<AppConfig['isProduction']>('isProduction') ?? false,
      sameSite: 'lax',
      expires: tokens.refreshExpiresAt,
      path: '/',
    });

    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure:
        this.config.get<AppConfig['isProduction']>('isProduction') ?? false,
      sameSite: 'lax',
      expires: tokens.refreshExpiresAt,
      path: '/api/v1/auth',
    });
  }
}
