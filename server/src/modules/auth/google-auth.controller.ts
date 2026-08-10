import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Public } from '@/common/decorators/public.decorator';
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
  ) {}

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
    const identity = request.user as unknown as GoogleIdentity;
    const result = await this.auth.loginWithGoogle(identity);

    const webUrl = this.config.get<AppConfig['webUrl']>('webUrl') ?? '';

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
