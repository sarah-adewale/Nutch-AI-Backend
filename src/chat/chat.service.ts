import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LimitsService } from '../limits/limits.service';

/** Default page size for the history list. */
export const SESSIONS_PAGE_SIZE = 20;

/** Ceiling on a caller-supplied page size. */
export const MAX_SESSIONS_PAGE_SIZE = 100;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private limits: LimitsService,
  ) {}

  async createChatSession(userId: string, modelUsed: string, title?: string) {
    await this.limits.assertCanCreate(userId, 'chat_sessions');

    return this.prisma.chatSession.create({
      data: {
        userId,
        modelUsed,
        title,
      },
    });
  }

  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    inputType?: string,
    context?: string,
    modelUsed?: string,
  ) {
    return this.prisma.message.create({
      data: {
        sessionId,
        role,
        content,
        inputType,
        context,
        modelUsed,
      },
    });
  }

  /**
   * One page of sessions, newest first. Messages are counted rather than
   * loaded: a logged-in user has unlimited history, so including every message
   * of every session would return their whole corpus in one response.
   */
  async getUserChatSessions(
    userId: string,
    options: { limit?: number; cursor?: string } = {},
  ) {
    // A missing, non-numeric or non-positive limit falls back to the default
    // rather than reaching Prisma as NaN or 0.
    const requested = Number(options.limit);
    const take =
      Number.isFinite(requested) && requested >= 1
        ? Math.min(Math.trunc(requested), MAX_SESSIONS_PAGE_SIZE)
        : SESSIONS_PAGE_SIZE;

    const sessions = await this.prisma.chatSession.findMany({
      where: { userId },
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });

    const hasMore = sessions.length > take;
    const page = hasMore ? sessions.slice(0, take) : sessions;

    return {
      sessions: page.map(({ _count, messages, ...session }) => ({
        ...session,
        messageCount: _count.messages,
        lastMessage: messages[0] ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getChatSession(sessionId: string, userId: string) {
    return this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });
  }

  async deleteChatSession(sessionId: string, userId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    await this.prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return { success: true };
  }

  async searchChatHistory(userId: string, query: string) {
    return this.prisma.message.findMany({
      where: {
        session: {
          userId,
        },
        content: {
          contains: query,
          mode: 'insensitive',
        },
      },
      include: {
        session: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
  }
}
