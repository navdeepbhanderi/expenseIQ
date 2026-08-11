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

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    maximum: 31,
    description:
      'Day of month. Clamped to the last day in shorter months. Omit it and ' +
      'set onMonthEnd instead for "the last day, whatever it is".',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Fires on the last day of the month — the 30th in April, the 28th or ' +
      '29th in February. A distinct intent from "the 31st", which only ' +
      'coincides with it in long months.',
  })
  @IsOptional()
  @IsBoolean()
  onMonthEnd?: boolean;

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

  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 6,
    description:
      'WEEKLY only. 0 = Sunday … 6 = Saturday. Omit and the rule falls seven ' +
      'days out from creation, which is an accident of timing rather than a ' +
      'choice.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({
    example: 4,
    minimum: 1,
    maximum: 12,
    description:
      'YEARLY and QUARTERLY only. 1 = January. The month the cycle is ' +
      'anchored to — YEARLY is genuinely ambiguous without it, and for ' +
      'QUARTERLY it picks Jan/Apr/Jul/Oct over Feb/May/Aug/Nov.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  monthOfYear?: number;

  @ApiPropertyOptional({
    example: '2027-03-31',
    description:
      'Last date the rule may fire. Omit for "until I turn it off". Use this ' +
      'for a lease or a policy that ends on a known date.',
  })
  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @ApiPropertyOptional({
    example: 6,
    minimum: 1,
    description:
      'Stop after this many entries — the natural way to say "6 EMIs left". ' +
      'Counted only on entries actually created, so a repeated run does not ' +
      'consume an instalment. Set with endsOn and whichever comes first wins.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOccurrences?: number;
}

export class UpdateRecurringDto {
  @ApiPropertyOptional({ example: 'Salary' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  onMonthEnd?: boolean;

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

  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 6,
    description:
      'WEEKLY only. 0 = Sunday … 6 = Saturday. Omit and the rule falls seven ' +
      'days out from creation, which is an accident of timing rather than a ' +
      'choice.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({
    example: 4,
    minimum: 1,
    maximum: 12,
    description:
      'YEARLY and QUARTERLY only. 1 = January. The month the cycle is ' +
      'anchored to — YEARLY is genuinely ambiguous without it, and for ' +
      'QUARTERLY it picks Jan/Apr/Jul/Oct over Feb/May/Aug/Nov.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  monthOfYear?: number;

  @ApiPropertyOptional({
    example: '2027-03-31',
    description:
      'Last date the rule may fire. Omit for "until I turn it off". Use this ' +
      'for a lease or a policy that ends on a known date.',
  })
  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @ApiPropertyOptional({
    example: 6,
    minimum: 1,
    description:
      'Stop after this many entries — the natural way to say "6 EMIs left". ' +
      'Counted only on entries actually created, so a repeated run does not ' +
      'consume an instalment. Set with endsOn and whichever comes first wins.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOccurrences?: number;
}
