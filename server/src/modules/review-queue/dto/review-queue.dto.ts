import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Direction, ReviewStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class EditReviewItemDto {
  @ApiPropertyOptional({ description: 'Paise' })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;

  @ApiPropertyOptional({ enum: Direction })
  @IsOptional()
  @IsEnum(Direction)
  direction?: Direction;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  merchant?: string;

  @ApiPropertyOptional({ example: '2026-08-05' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 140)
  note?: string;
}

export class BulkConfirmDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  itemIds!: string[];
}

export class UndoDto {
  @ApiProperty({ format: 'uuid', description: 'The token from confirm()' })
  @IsUUID()
  token!: string;
}

export class ReviewQueueQueryDto {
  @ApiPropertyOptional({ enum: ReviewStatus, default: ReviewStatus.PENDING })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}
