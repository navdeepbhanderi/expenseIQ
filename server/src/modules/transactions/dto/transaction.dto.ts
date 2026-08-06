import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Direction, TransactionSource } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
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
import { MAX_PAGE_SIZE } from '@/common/pagination/cursor';

/**
 * Accepts both `?categoryIds=a&categoryIds=b` and `?categoryIds=a,b`.
 *
 * Express gives a single repeated param as a string rather than an array, so
 * without this a one-item filter arrives as a bare string and the `in` clause
 * silently matches nothing.
 */
function toStringArray({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null) return undefined;

  const asText = (item: unknown): string[] =>
    // Anything that isn't a string is left for the validators to reject —
    // String(someObject) would produce "[object Object]" and quietly pass a
    // meaningless value into an `in` clause.
    typeof item === 'string' ? item.split(',').filter(Boolean) : [];

  return Array.isArray(value) ? value.flatMap(asText) : asText(value);
}

export class CreateTransactionDto {
  @ApiProperty({ example: 30_000, description: 'Paise. Always positive.' })
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiPropertyOptional({ enum: Direction, default: Direction.DEBIT })
  @IsOptional()
  @IsEnum(Direction)
  direction?: Direction;

  @ApiProperty({ example: '2026-08-05' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ example: 'SWIGGY*BLR9284' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  merchant?: string;

  @ApiPropertyOptional({ example: 'Dinner with Meera' })
  @IsOptional()
  @IsString()
  @Length(0, 140)
  note?: string;

  @ApiPropertyOptional({
    enum: TransactionSource,
    default: TransactionSource.MANUAL,
  })
  @IsOptional()
  @IsEnum(TransactionSource)
  source?: TransactionSource;
}

export class UpdateTransactionDto {
  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;

  @ApiPropertyOptional({ enum: Direction })
  @IsOptional()
  @IsEnum(Direction)
  direction?: Direction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsString()
  accountId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  merchant?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 140)
  note?: string;
}

/** Design 2e's filter bar. Every field is combinable. */
export class QueryTransactionsDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-05',
    description: 'Inclusive of the whole day.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsUUID(undefined, { each: true })
  accountIds?: string[];

  @ApiPropertyOptional({ enum: TransactionSource, isArray: true })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsEnum(TransactionSource, { each: true })
  sources?: TransactionSource[];

  @ApiPropertyOptional({ enum: Direction })
  @IsOptional()
  @IsEnum(Direction)
  direction?: Direction;

  @ApiPropertyOptional({ description: 'Search merchant or note' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  q?: string;

  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minAmountMinor?: number;

  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAmountMinor?: number;

  @ApiPropertyOptional({ default: 25, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  cursor?: string;
}
