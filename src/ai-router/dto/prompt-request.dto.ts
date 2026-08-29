import { IsString, IsOptional, IsIn, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PromptRequestDto {
  @ApiPropertyOptional({
    description: 'User ID (automatically set from authenticated user)',
    example: 'cmi8tb6tv0000rdimxbtp39do',
  })
  @IsOptional()
  @IsString()
  user_id?: string;

  @ApiProperty({
    description:
      'Model id to route to. Call GET /ai/models for the current list.',
    example: 'claude-opus-5',
  })
  @IsString()
  model: string;

  @ApiProperty({
    description: 'Type of input being processed',
    example: 'text',
    enum: ['text', 'code', 'image'],
  })
  @IsIn(['text', 'code', 'image'])
  input_type: string;

  @ApiPropertyOptional({
    description: 'Additional context for the AI model',
    example: 'You are a helpful coding assistant',
  })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiProperty({
    description: 'The prompt or question to send to the AI model',
    example: 'Write a function to calculate fibonacci numbers',
  })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({
    description:
      'Source URL of an image selected on the page. Required when input_type is "image".',
    example: 'https://example.com/diagram.png',
  })
  @IsOptional()
  @IsUrl()
  image_url?: string;

  @ApiPropertyOptional({
    description:
      'Continue an existing conversation. A new session is created when omitted.',
    example: 'cmi8tb6tv0000rdimxbtp39do',
  })
  @IsOptional()
  @IsString()
  session_id?: string;
}
