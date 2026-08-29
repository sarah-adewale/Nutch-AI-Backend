import { Module } from '@nestjs/common';
import { AiRouterController } from './ai-router.controller';
import { AiRouterService } from './ai-router.service';
import { OpenAiService } from './providers/openai.service';
import { AnthropicService } from './providers/anthropic.service';
import { EncryptionModule } from '../encryption/encryption.module';
import { FilesModule } from '../files/files.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [EncryptionModule, FilesModule, ChatModule],
  controllers: [AiRouterController],
  providers: [AiRouterService, OpenAiService, AnthropicService],
  exports: [AiRouterService],
})
export class AiRouterModule {}
