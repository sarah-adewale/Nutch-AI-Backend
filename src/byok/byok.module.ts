import { Module } from '@nestjs/common';
import { ByokController } from './byok.controller';
import { ByokService } from './byok.service';
import { EncryptionModule } from '../encryption/encryption.module';
import { UsersModule } from '../users/users.module';
import { ProvidersModule } from '../ai-router/providers/providers.module';

@Module({
  imports: [EncryptionModule, UsersModule, ProvidersModule],
  controllers: [ByokController],
  providers: [ByokService],
  exports: [ByokService],
})
export class ByokModule {}
