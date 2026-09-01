import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AiRouterService } from './ai-router.service';
import { PromptRequestDto } from './dto/prompt-request.dto';
import { AiResponseDto } from './dto/ai-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';

@ApiTags('ai')
@ApiBearerAuth('JWT-auth')
@Controller('ai')
@UseGuards(ThrottlerGuard, AuthGuard('jwt'))
export class AiRouterController {
  constructor(private aiRouterService: AiRouterService) {}

  @Get('models')
  @ApiOperation({
    summary: 'List selectable models',
    description:
      'Models the sidebar can offer, with their capabilities and whether a key is configured. Drives the model switcher.',
  })
  @ApiResponse({ status: 200, description: 'Model list' })
  listModels(@CurrentUser() user: AuthUser) {
    return this.aiRouterService.listAvailableModels(user.id);
  }

  @Post('prompt')
  @ApiOperation({
    summary: 'Process AI prompt',
    description:
      'Sends a prompt to the selected model and returns the full response. Both sides of the exchange are saved to the chat session.',
  })
  @ApiBody({ type: PromptRequestDto })
  @ApiResponse({ status: 201, type: AiResponseDto })
  @ApiResponse({ status: 400, description: 'Unknown model or invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({
    status: 503,
    description: 'No API key configured for the selected provider',
  })
  async processPrompt(
    @Body() promptRequest: PromptRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.aiRouterService.processPrompt(promptRequest, user.id);
  }

  @Post('prompt/stream')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Stream an AI response',
    description:
      'Server-sent events. Emits a `session` event, then a `delta` event per token chunk, then `done`. Errors arrive as an `error` event because headers are already sent.',
  })
  @ApiBody({ type: PromptRequestDto })
  @ApiResponse({ status: 200, description: 'Event stream' })
  async streamPrompt(
    @Body() promptRequest: PromptRequestDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const chunk of this.aiRouterService.streamPrompt(
        promptRequest,
        user.id,
      )) {
        if (chunk.type === 'session') {
          send('session', { session_id: chunk.sessionId });
        } else if (chunk.type === 'redirect') {
          send('redirect', chunk.redirect);
        } else {
          send('delta', { text: chunk.text });
        }
      }
      send('done', {});
    } catch (error) {
      // The response is already committed, so the status code cannot change.
      // The extension reads this event rather than a status.
      send('error', {
        message:
          error instanceof Error ? error.message : 'Failed to stream response',
      });
    } finally {
      res.end();
    }
  }
}
