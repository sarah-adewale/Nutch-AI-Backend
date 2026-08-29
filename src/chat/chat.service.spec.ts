import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    chatSession: {
      findFirst: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
    message: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      chatSession: {
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new ChatService(prisma as unknown as PrismaService);
  });

  describe('deleteChatSession', () => {
    it('throws NotFoundException when the session does not exist', async () => {
      prisma.chatSession.findFirst.mockResolvedValue(null);

      await expect(service.deleteChatSession('s1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not delete anything when the lookup misses', async () => {
      prisma.chatSession.findFirst.mockResolvedValue(null);

      await expect(service.deleteChatSession('s1', 'u1')).rejects.toThrow();
      expect(prisma.chatSession.delete).not.toHaveBeenCalled();
    });

    it('scopes the lookup to the owner so one user cannot delete another’s session', async () => {
      prisma.chatSession.findFirst.mockResolvedValue({ id: 's1' });

      await service.deleteChatSession('s1', 'u1');

      expect(prisma.chatSession.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', userId: 'u1' },
      });
    });

    it('deletes and reports success when the session belongs to the user', async () => {
      prisma.chatSession.findFirst.mockResolvedValue({ id: 's1' });

      await expect(service.deleteChatSession('s1', 'u1')).resolves.toEqual({
        success: true,
      });
      expect(prisma.chatSession.delete).toHaveBeenCalledWith({
        where: { id: 's1' },
      });
    });
  });

  describe('getChatSession', () => {
    it('constrains the query by user id as well as session id', async () => {
      prisma.chatSession.findFirst.mockResolvedValue(null);

      await service.getChatSession('s1', 'u1');

      expect(prisma.chatSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's1', userId: 'u1' } }),
      );
    });
  });

  describe('searchChatHistory', () => {
    it('searches case-insensitively within the user’s own sessions only', async () => {
      await service.searchChatHistory('u1', 'fibonacci');

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            session: { userId: 'u1' },
            content: { contains: 'fibonacci', mode: 'insensitive' },
          },
        }),
      );
    });

    it('caps the number of results returned', async () => {
      await service.searchChatHistory('u1', 'x');

      const [args] = prisma.message.findMany.mock.calls[0];
      expect(args.take).toBe(50);
    });
  });

  describe('addMessage', () => {
    it('records the role, content and model used', async () => {
      await service.addMessage(
        's1',
        'assistant',
        'hi',
        'text',
        undefined,
        'gpt-4',
      );

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          sessionId: 's1',
          role: 'assistant',
          content: 'hi',
          inputType: 'text',
          context: undefined,
          modelUsed: 'gpt-4',
        },
      });
    });
  });
});
