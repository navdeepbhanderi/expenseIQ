import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Cadence } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class ConfirmRecurrenceDto {
  @ApiProperty({
    example: 'merchant:4e742687-b067-4f28-a6b2-138904da89c1',
    description:
      'The signature from GET /recurring/detected. Only names which pattern ' +
      'to accept — the amounts and cadence are re-derived from history, so a ' +
      'caller cannot invent a rule that was never in the data.',
  })
  @IsString()
  @Length(1, 200)
  signature!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoDebit?: boolean;
}

export class UpdateRecurringDto {
  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;

  @ApiPropertyOptional({ enum: Cadence })
  @IsOptional()
  @IsEnum(Cadence)
  cadence?: Cadence;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoDebit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
