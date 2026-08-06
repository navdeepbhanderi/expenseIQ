import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileKind } from '@prisma/client';
import {
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({ example: 'Sharma family' })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional({ enum: ProfileKind, default: ProfileKind.PERSONAL })
  @IsOptional()
  @IsEnum(ProfileKind)
  kind?: ProfileKind;

  @ApiPropertyOptional({ example: 'en-IN' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/, {
    message: 'locale must look like "en" or "en-IN"',
  })
  locale?: string;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' })
  currency?: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Household' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({ example: 'en-IN' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  locale?: string;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ example: '#1F6F5C' })
  @IsOptional()
  @IsHexColor()
  avatarColor?: string;
}
