import { IsIn, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProviderName } from '../../ai-router/providers/ai-provider.interface';

export const BYOK_PROVIDERS: ProviderName[] = ['anthropic', 'openai'];

export class UpsertByokKeyDto {
  @ApiProperty({
    description: 'Which provider the key belongs to',
    enum: BYOK_PROVIDERS,
    example: 'anthropic',
  })
  @IsIn(BYOK_PROVIDERS)
  provider: ProviderName;

  @ApiProperty({
    description:
      'The API key. Encrypted before storage and never returned by any endpoint.',
    example: 'sk-ant-api03-...',
  })
  @IsString()
  @MinLength(8)
  api_key: string;
}
