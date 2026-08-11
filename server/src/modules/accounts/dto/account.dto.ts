import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Amounts cross the wire as integer paise, matching every response.
 * `Math.round(₹90 trillion in paise)` still fits in a JS number, so a plain
 * integer is safe and spares clients from parsing stringified decimals.
 */
export class CreateAccountDto {
  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiProperty({ example: 'HDFC Millennia' })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional({ example: 'HDFC Bank' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  issuer?: string;

  @ApiPropertyOptional({ example: '8842', description: 'Last 4 digits only' })
  @IsOptional()
  @IsString()
  // Only the last four are ever accepted. A full card number is not something
  // this product needs, and not storing it removes the risk entirely.
  @Matches(/^\d{4}$/, { message: 'last4 must be exactly 4 digits' })
  last4?: string;

  @ApiPropertyOptional({ example: 38_42_000, description: 'Paise' })
  @IsOptional()
  @IsInt()
  balanceMinor?: number;

  @ApiPropertyOptional({
    example: 2_00_000_00,
    description: 'Paise. Cards only.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditLimitMinor?: number;

  @ApiPropertyOptional({ example: 28, description: 'Day of month, 1–31' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  statementDay?: number;

  @ApiPropertyOptional({ example: 12, description: 'Day of month, 1–31' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number;

  @ApiPropertyOptional({ example: 5, default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minDuePercent?: number;

  @ApiPropertyOptional({
    example: 60_00_000_00,
    description: 'Paise. Loans only.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  principalMinor?: number;

  @ApiPropertyOptional({
    example: 42_150_00,
    description: 'Paise. Optional - computed from the terms when omitted.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  emiAmountMinor?: number;

  @ApiPropertyOptional({ example: 8.4, description: 'Annual percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate?: number;

  @ApiPropertyOptional({ example: 240 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  tenureMonths?: number;

  @ApiPropertyOptional({ example: 98 })
  @IsOptional()
  @IsInt()
  @Min(0)
  emisPaid?: number;

  @ApiPropertyOptional({ example: '2018-04-18' })
  @IsOptional()
  @IsDateString()
  firstEmiDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFloatingRate?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoDebit?: boolean;
}

export class UpdateAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  last4?: string;

  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @IsInt()
  balanceMinor?: number;

  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditLimitMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  statementDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minDuePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate?: number;

  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @IsInt()
  @Min(1)
  emiAmountMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  emisPaid?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoDebit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFloatingRate?: boolean;
  /*
   * The loan terms, which were create-only.
   *
   * A principal or tenure typed wrong at setup had no remedy but deleting the
   * account and rebuilding it, taking its transaction history with it. Every
   * amortisation figure on the account page is derived from these three, so
   * one wrong digit made the whole page wrong and unfixable.
   *
   * `type` is deliberately still absent: a credit card cannot become a loan,
   * the two share almost no fields, and allowing the change would leave rows
   * carrying terms that make no sense for what they now claim to be.
   */
  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @IsInt()
  @Min(0)
  principalMinor?: number;

  @ApiPropertyOptional({ example: 240 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  tenureMonths?: number;

  @ApiPropertyOptional({ example: '2024-06-05' })
  @IsOptional()
  @IsDateString()
  firstEmiDate?: string;

}

export class PrepaySimulationDto {
  @ApiProperty({ example: 5_00_000_00, description: 'Paise' })
  @IsInt()
  @Min(1)
  amountMinor!: number;
}
