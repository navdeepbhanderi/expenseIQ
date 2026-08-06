import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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
  LoginDto,
  RefreshDto,
  ResendVerificationDto,
  SignupDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import type { TokenPair } from './token.service';

const REFRESH_COOKIE = 'eiq_refresh';

/**
 * Auth endpoints carry a much tighter rate limit than the global default.
 *
 * These are the routes worth brute-forcing — password guessing on login,
 * account enumeration on signup, and token grinding on refresh — so they get
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
   * never read it — that's what stops an XSS bug from turning into a stolen
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
  }
}
