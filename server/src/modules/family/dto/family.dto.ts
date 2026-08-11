import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { NormalisedEmail } from '@/common/validation/normalised-email.decorator';

export class InviteMemberDto {
  @ApiProperty({ example: 'meera@example.com' })
  @NormalisedEmail()
  email!: string;

  @ApiPropertyOptional({
    enum: ProfileRole,
    default: ProfileRole.ADULT,
    description:
      'Recorded on the invite, so accepting cannot escalate it - a CHILD ' +
      'invite stays a CHILD invite however the acceptance is shaped.',
  })
  @IsOptional()
  @IsEnum(ProfileRole)
  role?: ProfileRole;
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'Token from the invitation link' })
  @IsString()
  @Length(1, 200)
  token!: string;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: ProfileRole })
  @IsEnum(ProfileRole)
  role!: ProfileRole;
}

export class CategoryLimitDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 200_000, description: 'Paise. Zero removes it.' })
  @IsInt()
  @Min(0)
  amountMinor!: number;
}

export class SetSpendLimitsDto {
  @ApiPropertyOptional({
    example: 120_000,
    description: 'Paise. Zero removes.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  overallMinor?: number;

  @ApiPropertyOptional({ type: [CategoryLimitDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryLimitDto)
  categories?: CategoryLimitDto[];
}

export class SetAllowanceDto {
  @ApiProperty({ example: 120_000, description: 'Paise. Design 2c: ₹1,200.' })
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Day of month, clamped in short months.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateGoalDto {
  @ApiProperty({ example: 'New bicycle' })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiProperty({ example: 1_500_000, description: 'Paise' })
  @IsInt()
  @Min(1)
  targetMinor!: number;

  @ApiPropertyOptional({ example: '2026-12-25' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;
}

export class UpdateGoalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetMinor?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  targetDate?: string | null;
}

export class ContributeDto {
  @ApiProperty({ example: 50_000, description: 'Paise' })
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiPropertyOptional({ example: 'Birthday money from Nani' })
  @IsOptional()
  @IsString()
  @Length(0, 140)
  note?: string;
}
