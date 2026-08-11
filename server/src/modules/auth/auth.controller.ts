import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/common/types/express';
import type { AppConfig } from '@/config/configuration';

import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  ResendVerificationDto,
  ResetPasswordDto,
  SignupDto,
  VerificationStatusQueryDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import type { TokenPair } from './token.service';

const REFRESH_COOKIE = 'eiq_refresh';

/**
 * A readable hint that a session exists - deliberately NOT the session.
 *
 * The refresh token is httpOnly, so the marketing pages (which have no auth
 * context, by design, to stay static) cannot tell a signed-in visitor from a
 * stranger and show everyone "Log in". This carries no identity, no token and
 * no claim the server trusts: it exists purely so the UI can offer the right
 * button. Every actual authorisation decision still rests on the httpOnly
 * cookie and the access token.
 */
const SESSION_HINT_COOKIE = 'eiq_session';

/**
 * Auth endpoints carry a much tighter rate limit than the global default.
 *
 * These are the routes worth brute-forcing - password guessing on login,
 * account enumeration on signup, and token grinding on refresh - so they get
 * 10 requests per minute rather than the app-wide 120.
 */
@ApiTags('auth')
@Controller('auth')
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Always reports success, so the response cannot be used to discover ' +
      'which email addresses are registered.',
  })
  signup(@Body() dto: SignupDto): Promise<{ message: string }> {
    return this.auth.signup(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consume a verification link' })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Re-send the verification link' })
  resend(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
    return this.auth.resendVerification(dto.email);
  }

  /**
   * Polled by design 7d's "this page updates on its own".
   *
   * A GET with a slacker limit than its siblings: it is read-only, leaks
   * nothing (unknown addresses answer `false`), and a page waiting on a slow
   * inbox will legitimately call it many times. Throttling it at 10/min would
   * break the very screen it exists for.
   */
  @Public()
  @Get('verification-status')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Whether an address has been verified yet' })
  verificationStatus(
    @Query() query: VerificationStatusQueryDto,
  ): Promise<{ verified: boolean }> {
    return this.auth.verificationStatus(query.email);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Always 202, whether or not the address exists - answering differently ' +
      'would turn this into a membership check for any list of emails.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password from a reset link',
    description:
      'Consumes the token and revokes every existing session for that user.',
  })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for a token pair' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: unknown; accessToken: string; expiresIn: string }> {
    const result = await this.auth.login(dto);
    this.setRefreshCookie(response, result.tokens);

    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.accessExpiresIn,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description:
      'Presenting an already-used token is treated as theft: the entire ' +
      'token family is revoked and every session from that login ends.',
  })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string; expiresIn: string }> {
    const token = this.readRefreshToken(request, dto);

    if (!token) {
      throw new UnauthorizedException('No refresh token supplied');
    }

    const tokens = await this.auth.refresh(token);
    this.setRefreshCookie(response, tokens);

    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.accessExpiresIn,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current token family' })
  async logout(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const token = this.readRefreshToken(request, dto);
    const result = await this.auth.logout(token);
    this.clearRefreshCookie(response);
    return result;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  // ─── Cookie handling ───────────────────────────────────────────────────────

  /**
   * The refresh token goes in an httpOnly cookie so browser JavaScript can
   * never read it - that's what stops an XSS bug from turning into a stolen
   * long-lived session. A body field is accepted too, for non-browser clients
   * that have no cookie jar.
   */
  private readRefreshToken(
    request: Request,
    dto: RefreshDto,
  ): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE] ?? dto.refreshToken;
  }

  private setRefreshCookie(response: Response, tokens: TokenPair): void {
    // Readable by the client on purpose - see SESSION_HINT_COOKIE.
    response.cookie(SESSION_HINT_COOKIE, '1', {
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
      // Scoped to the refresh routes, so the token isn't attached to every
      // API call and can't leak through an unrelated endpoint's logs.
      path: '/api/v1/auth',
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    // Cleared together, or the marketing pages keep offering "Dashboard" to
    // someone who has just signed out.
    response.clearCookie(SESSION_HINT_COOKIE, { path: '/' });
  }
}
