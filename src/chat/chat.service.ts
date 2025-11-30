import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createChatSession(userId: string, modelUsed: string, title?: string) {
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

  async getUserChatSessions(userId: string) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
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
      throw new Error('Chat session not found');
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
