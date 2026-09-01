import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AiRouterModule } from './ai-router/ai-router.module';
import { ChatModule } from './chat/chat.module';
import { FilesModule } from './files/files.module';
import { EncryptionModule } from './encryption/encryption.module';
import { HealthModule } from './health/health.module';
import { LimitsModule } from './limits/limits.module';
import { ByokModule } from './byok/byok.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: parseInt(process.env.RATE_LIMIT_TTL || '60') * 1000,
        limit: parseInt(process.env.RATE_LIMIT_LIMIT || '100'),
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AiRouterModule,
    ChatModule,
    FilesModule,
    EncryptionModule,
    HealthModule,
    LimitsModule,
    ByokModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
