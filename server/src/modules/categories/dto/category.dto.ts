import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsHexColor,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Tuition' })
  @IsString()
  @Length(1, 40)
  name!: string;

  @ApiPropertyOptional({
    example: 'TU',
    description: 'Two-letter monogram. Derived from the name when omitted.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\p{L}{2}$/u, { message: 'monogram must be exactly two letters' })
  monogram?: string;

  @ApiPropertyOptional({ example: '#E7F0EA' })
  @IsOptional()
  @IsHexColor()
  tint?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isIncome?: boolean;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'School fees' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string;

  @ApiPropertyOptional({ example: 'SF' })
  @IsOptional()
  @IsString()
  @Matches(/^\p{L}{2}$/u)
  monogram?: string;

  @ApiPropertyOptional({ example: '#E7F0EA' })
  @IsOptional()
  @IsHexColor()
  tint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isIncome?: boolean;
}
