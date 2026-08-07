import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { PeriodKind } from '../domain/periods';

export class PeriodKindQueryDto {
  @ApiPropertyOptional({
    enum: ['month', 'quarter', 'year'],
    default: 'month',
    description: 'The segmented control in design 6c.',
  })
  @IsOptional()
  @IsIn(['month', 'quarter', 'year'])
  period?: PeriodKind;
}
