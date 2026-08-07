import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class CategoryBudgetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 25_000_00, description: 'Paise. Zero removes it.' })
  @IsInt()
  @Min(0)
  amountMinor!: number;
}

export class SetBudgetsDto {
  @ApiPropertyOptional({
    example: 80_000_00,
    description: 'Paise. The overall monthly budget. Zero removes it.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  overallMinor?: number;

  @ApiPropertyOptional({ type: [CategoryBudgetDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryBudgetDto)
  categories?: CategoryBudgetDto[];
}

export class MonthQueryDto {
  @ApiPropertyOptional({
    example: '2026-08',
    description: 'Defaults to the current month.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must look like 2026-08' })
  month?: string;
}
