import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReminderChannel } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class SetReminderDto {
  @ApiPropertyOptional({
    example: 3,
    default: 3,
    description: 'Days before the due date. Design 6h: "3 days ahead".',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  offsetDays?: number;

  @ApiPropertyOptional({
    example: 540,
    default: 540,
    description:
      'Minutes past *local* midnight. Design 6h: "9 am" is 540. Interpreted ' +
      'in the profile timezone — 9 am UTC would arrive at 2:30 pm in India.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  timeOfDay?: number;

  @ApiPropertyOptional({
    enum: ReminderChannel,
    isArray: true,
    default: [ReminderChannel.EMAIL],
    description: 'In-app is always delivered; these are the extra surfaces.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ReminderChannel, { each: true })
  channels?: ReminderChannel[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
