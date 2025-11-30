import { IsString, IsOptional, IsIn } from 'class-validator';
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
    description: 'AI model to use for processing',
    example: 'gpt-4',
    enum: ['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'claude-2'],
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
}
