import { Module, type Provider } from '@nestjs/common';
import {
  JwtModule,
  type JwtModuleOptions,
  type JwtSignOptions,
} from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ProfilesModule } from '@/modules/profiles/profiles.module';
import type { AppConfig } from '@/config/configuration';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GoogleAuthController } from './google-auth.controller';

/**
 * Google is registered conditionally.
 *
 * passport-google-oauth20 throws during construction when clientID is absent,
 * so registering it unconditionally would stop the app booting for anyone
 * without a Google Cloud project - an unreasonable price for a feature that
 * isn't needed until it's needed. The controller reports 501 when it's off.
 */
function googleProviders(): Provider[] {
  const hasCredentials =
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET);

  return hasCredentials ? [GoogleStrategy] : [];
}

@Module({
  imports: [
    PassportModule.register({ session: false }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const jwt = config.get<AppConfig['jwt']>('jwt');
        return {
          secret: jwt?.accessSecret,
          signOptions: {
            expiresIn: (jwt?.accessTtl ?? '15m') as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
    ProfilesModule,
  ],
  controllers: [AuthController, GoogleAuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    JwtStrategy,
    GoogleAuthGuard,
    ...googleProviders(),
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
