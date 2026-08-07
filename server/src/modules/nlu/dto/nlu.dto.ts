import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InputMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ParseDto {
  @ApiProperty({
    example: '300 रुपये किराने पे खर्च किए',
    description:
      'Any language, or a mix. "petrol bharwaya 1200" is normal input.',
  })
  @IsString()
  @Length(1, 500)
  text!: string;

  @ApiPropertyOptional({ enum: InputMode, default: InputMode.TEXT })
  @IsOptional()
  @IsEnum(InputMode)
  inputMode?: InputMode;
}

export class AccuracyQueryDto {
  @ApiPropertyOptional({ default: 30, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class AccountSuggestionQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
