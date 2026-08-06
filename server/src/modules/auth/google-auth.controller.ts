import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Public } from '@/common/decorators/public.decorator';
import type { AppConfig } from '@/config/configuration';

import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import type { GoogleIdentity } from './strategies/google.strategy';

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

    // The token goes in the URL fragment, not the query string: fragments are
    // never sent to a server, so it stays out of access logs, proxy logs and
    // the Referer header of whatever the page loads next.
    response.redirect(
      `${webUrl}/auth/callback#accessToken=${encodeURIComponent(
        result.tokens.accessToken,
      )}`,
    );
  }
}
