import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class SetLlmCredentialDto {
  @ApiProperty({ example: 'groq' })
  @IsString()
  @Length(1, 40)
  provider!: string;

  @ApiProperty({ example: 'llama-3.1-8b-instant' })
  @IsString()
  @Length(1, 120)
  model!: string;

  /**
   * The key itself. Write-only - no response ever contains it.
   *
   * Length-bounded rather than pattern-matched here: the exact shape is
   * checked against the provider's own pattern in the service, which gives a
   * message naming the provider instead of a generic validation failure.
   */
  @ApiProperty({ example: 'gsk_…', writeOnly: true })
  @IsString()
  @Length(8, 400)
  apiKey!: string;
}
