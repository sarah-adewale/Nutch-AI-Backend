import { ApiProperty } from '@nestjs/swagger';

export class AiResponseDto {
  @ApiProperty({
    description: 'The AI-generated response',
    example:
      'Here is a function to calculate fibonacci numbers:\n\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}',
  })
  response: string;

  @ApiProperty({
    description: 'The AI model that generated the response',
    example: 'gpt-4',
  })
  model_used: string;

  @ApiProperty({
    description: 'Timestamp when the response was generated',
    example: '2023-11-28T10:30:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'File type for automatic organization',
    example: 'js',
  })
  file_type: string;

  @ApiProperty({
    description: 'Folder for automatic organization',
    example: '/code',
    enum: ['/code', '/documents'],
  })
  folder: string;
}

export class RedirectResponseDto {
  @ApiProperty({
    description: 'Indicates this is a redirect response',
    example: true,
  })
  redirect: true;

  @ApiProperty({
    description: 'Recommended external tool',
    example: 'midjourney',
  })
  tool: string;

  @ApiProperty({
    description: 'Reason for the redirect',
    example: 'Image generation is not supported by this model',
  })
  reason: string;

  @ApiProperty({
    description: 'Pre-filled query for the external tool',
    example: 'Create a fantasy-style illustration of...',
  })
  pre_fill: string;
}
