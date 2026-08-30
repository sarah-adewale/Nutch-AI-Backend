import {
  Controller,
  Get,
  Delete,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('sessions')
  async getUserChatSessions(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.chatService.getUserChatSessions(user.id, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get('sessions/:id')
  async getChatSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.getChatSession(sessionId, user.id);
  }

  @Delete('sessions/:id')
  async deleteChatSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.deleteChatSession(sessionId, user.id);
  }

  @Get('search')
  async searchChatHistory(
    @Query('q') query: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chatService.searchChatHistory(user.id, query);
  }
}
