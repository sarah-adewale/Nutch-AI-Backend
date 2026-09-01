import { Module } from '@nestjs/common';
import { AiRouterController } from './ai-router.controller';
import { AiRouterService } from './ai-router.service';
import { EncryptionModule } from '../encryption/encryption.module';
import { FilesModule } from '../files/files.module';
import { ChatModule } from '../chat/chat.module';
import { ByokModule } from '../byok/byok.module';
import { UsersModule } from '../users/users.module';
import { ProvidersModule } from './providers/providers.module';

@Module({
  imports: [
    EncryptionModule,
    FilesModule,
    ChatModule,
    ByokModule,
    UsersModule,
    ProvidersModule,
  ],
  controllers: [AiRouterController],
  providers: [AiRouterService],
  exports: [AiRouterService],
})
export class AiRouterModule {}
