import { Module } from '@nestjs/common';
// import { BullModule } from '@nestjs/bull';
import { AiRouterController } from './ai-router.controller';
import { AiRouterService } from './ai-router.service';
// import { AiProcessor } from './ai.processor';
import { OpenAiService } from './providers/openai.service';
import { EncryptionModule } from '../encryption/encryption.module';
import { FilesModule } from '../files/files.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    // BullModule.registerQueue({
    //   name: 'ai-processing',
    // }),
    EncryptionModule,
    FilesModule,
    ChatModule,
  ],
  controllers: [AiRouterController],
  providers: [AiRouterService, OpenAiService],
  exports: [AiRouterService],
})
export class AiRouterModule {}
