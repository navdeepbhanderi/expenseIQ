import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Cadence, Direction } from '@prisma/client';
import {
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

/**
 * Creates a rule from scratch, rather than accepting one the detector found.
 *
 * Detection needs three occurrences before a pattern is visible, which is
 * three months for anything monthly. Someone who knows their salary lands on
 * the 1st should not have to wait a quarter for the app to notice — and
 * income in particular may never be "detected" at all if it is the only
 * credit on the account.
 */
export class CreateRecurringDto {
  @ApiProperty({ example: 14_20_000_00, description: 'Paise.' })
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiProperty({ enum: Cadence, example: 'MONTHLY' })
  @IsEnum(Cadence)
  cadence!: Cadence;

  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: 31,
    description:
      'Day of month. Clamped to the last day in shorter months, so 31 still ' +
      'fires in February.',
  })
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth!: number;

  @ApiPropertyOptional({
    enum: Direction,
    default: 'DEBIT',
    description: 'CREDIT for salary and other income.',
  })
  @IsOptional()
  @IsEnum(Direction)
  direction?: Direction;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Monthly salary' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

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
