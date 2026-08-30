import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import {
  LimitExceededException,
  LimitedResource,
} from './limit-exceeded.exception';

/** -1 means unlimited. */
export interface UserLimits {
  maxChatSessions: number;
  maxFiles: number;
}

export const UNLIMITED = -1;

@Injectable()
export class LimitsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  limitsFor(isAnonymous: boolean): UserLimits {
    if (!isAnonymous) {
      return { maxChatSessions: UNLIMITED, maxFiles: UNLIMITED };
    }

    return {
      maxChatSessions: this.readLimit('MAX_CHAT_SESSIONS_ANONYMOUS', 3),
      maxFiles: this.readLimit('MAX_FILES_ANONYMOUS', 5),
    };
  }

  /**
   * Environment variables arrive as strings, so ConfigService hands back "3"
   * rather than 3. Left uncoerced the API advertises string limits and every
   * comparison leans on JS coercion.
   */
  private readLimit(key: string, fallback: number): number {
    const parsed = Number(this.config.get(key));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  async limitsForUser(userId: string): Promise<UserLimits> {
    return this.limitsFor(await this.isAnonymous(userId));
  }

  async assertCanCreate(
    userId: string,
    resource: LimitedResource,
  ): Promise<void> {
    const limits = await this.limitsForUser(userId);
    const limit =
      resource === 'chat_sessions' ? limits.maxChatSessions : limits.maxFiles;

    if (limit === UNLIMITED) return;

    const current = await this.count(userId, resource);
    if (current >= limit) {
      throw new LimitExceededException(resource, limit, current);
    }
  }

  private async isAnonymous(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return !user?.email;
  }

  private count(userId: string, resource: LimitedResource): Promise<number> {
    return resource === 'chat_sessions'
      ? this.prisma.chatSession.count({ where: { userId } })
      : this.prisma.file.count({ where: { userId } });
  }
}
