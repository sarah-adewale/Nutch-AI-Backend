import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AiRouterService } from './ai-router.service';
import { PromptRequestDto } from './dto/prompt-request.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';

@ApiTags('ai')
@ApiBearerAuth('JWT-auth')
@Controller('ai')
@UseGuards(ThrottlerGuard, AuthGuard('jwt'))
export class AiRouterController {
  constructor(private aiRouterService: AiRouterService) {}

  @Post('prompt')
  @ApiOperation({
    summary: 'Process AI prompt',
    description:
      'Send a prompt to AI models for processing. Supports text, code, and image input types.',
  })
  @ApiBody({ type: PromptRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Prompt queued for processing',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', example: '12345' },
        status: { type: 'string', example: 'processing' },
        message: { type: 'string', example: 'Request queued for processing' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded',
  })
  async processPrompt(
    @Body() promptRequest: PromptRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Override user_id with authenticated user
    promptRequest.user_id = user.id;
    return this.aiRouterService.processPrompt(promptRequest);
  }
}
