import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { NormalisedEmail } from '@/common/validation/normalised-email.decorator';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from '../domain/password-policy';

export class SignupDto {
  @ApiProperty({ example: 'aarav@example.com' })
  @NormalisedEmail()
  email!: string;

  @ApiProperty({
    example: 'Kirana@2026',
    minLength: MIN_PASSWORD_LENGTH,
    description:
      'At least 8 characters, one number, one special character. ' +
      'Full rules are enforced server-side and returned in `details` on failure.',
  })
  @IsString()
  // Bounds only. The real policy lives in domain/password-policy.ts so it can
  // return every failure at once instead of one decorator message at a time.
  @Length(1, MAX_PASSWORD_BYTES)
  password!: string;

  @ApiPropertyOptional({ example: 'Aarav' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'aarav@example.com' })
  @NormalisedEmail()
  email!: string;

  @ApiProperty({ example: 'Kirana@2026' })
  @IsString()
  @Length(1, MAX_PASSWORD_BYTES)
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Token from the verification link' })
  @IsString()
  @Length(1, 200)
  token!: string;
}

export class ResendVerificationDto {
  @ApiProperty({ example: 'aarav@example.com' })
  @NormalisedEmail()
  email!: string;
}

export class RefreshDto {
  @ApiPropertyOptional({
    description:
      'Only needed by clients that cannot use cookies. Browsers should rely ' +
      'on the httpOnly refresh cookie instead.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'aarav@example.com' })
  @NormalisedEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the emailed reset link' })
  @IsString()
  @Length(1, 200)
  token!: string;

  @ApiProperty({
    example: 'Kirana@2026',
    minLength: MIN_PASSWORD_LENGTH,
    description:
      'Same policy as signup - at least 8 characters, one number, one ' +
      'special character. Enforced server-side by domain/password-policy.ts.',
  })
  @IsString()
  @Length(1, MAX_PASSWORD_BYTES)
  password!: string;
}

export class VerificationStatusQueryDto {
  @ApiProperty({ example: 'aarav@example.com' })
  @NormalisedEmail()
  email!: string;
}
