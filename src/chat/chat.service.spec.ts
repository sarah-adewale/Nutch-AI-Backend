import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LimitsService } from '../limits/limits.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    chatSession: {
      findFirst: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
    message: { create: jest.Mock; findMany: jest.Mock };
  };
  let limits: { assertCanCreate: jest.Mock };

  beforeEach(() => {
    prisma = {
      chatSession: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 's1' }),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    limits = { assertCanCreate: jest.fn().mockResolvedValue(undefined) };
    service = new ChatService(
      prisma as unknown as PrismaService,
      limits as unknown as LimitsService,
    );
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

  describe('createChatSession', () => {
    it('checks the session quota before creating', async () => {
      limits.assertCanCreate.mockRejectedValue(new Error('at the cap'));

      await expect(
        service.createChatSession('u1', 'claude-opus-5', 'title'),
      ).rejects.toThrow('at the cap');
      expect(prisma.chatSession.create).not.toHaveBeenCalled();
    });

    it('checks the chat_sessions resource specifically', async () => {
      await service.createChatSession('u1', 'claude-opus-5');
      expect(limits.assertCanCreate).toHaveBeenCalledWith(
        'u1',
        'chat_sessions',
      );
    });
  });

  describe('getUserChatSessions pagination', () => {
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        _count: { messages: 4 },
        messages: [{ id: `m${i}`, content: 'last' }],
      }));

    it('does not load every message of every session', async () => {
      prisma.chatSession.findMany.mockResolvedValue(page(2));

      await service.getUserChatSessions('u1');

      const [args] = prisma.chatSession.findMany.mock.calls[0];
      expect(args.include.messages.take).toBe(1);
      expect(args.include._count).toEqual({ select: { messages: true } });
    });

    it('returns a message count and last message per session', async () => {
      prisma.chatSession.findMany.mockResolvedValue(page(1));

      const result = await service.getUserChatSessions('u1');

      expect(result.sessions[0].messageCount).toBe(4);
      expect(result.sessions[0].lastMessage).toEqual({
        id: 'm0',
        content: 'last',
      });
    });

    it('reports no next cursor when the page is not full', async () => {
      prisma.chatSession.findMany.mockResolvedValue(page(3));

      const result = await service.getUserChatSessions('u1', { limit: 5 });

      expect(result.nextCursor).toBeNull();
      expect(result.sessions).toHaveLength(3);
    });

    it('trims the lookahead row and returns a cursor when there is more', async () => {
      prisma.chatSession.findMany.mockResolvedValue(page(3));

      const result = await service.getUserChatSessions('u1', { limit: 2 });

      expect(result.sessions).toHaveLength(2);
      expect(result.nextCursor).toBe('s1');
    });

    it('fetches one extra row to detect a further page', async () => {
      prisma.chatSession.findMany.mockResolvedValue([]);

      await service.getUserChatSessions('u1', { limit: 10 });

      expect(prisma.chatSession.findMany.mock.calls[0][0].take).toBe(11);
    });

    it('skips the cursor row itself when continuing', async () => {
      prisma.chatSession.findMany.mockResolvedValue([]);

      await service.getUserChatSessions('u1', { cursor: 's9' });

      const [args] = prisma.chatSession.findMany.mock.calls[0];
      expect(args.cursor).toEqual({ id: 's9' });
      expect(args.skip).toBe(1);
    });

    it('clamps an absurd page size', async () => {
      prisma.chatSession.findMany.mockResolvedValue([]);

      await service.getUserChatSessions('u1', { limit: 100000 });

      expect(prisma.chatSession.findMany.mock.calls[0][0].take).toBe(101);
    });

    it.each([0, -5])(
      'falls back to the default for a limit of %s',
      async (limit) => {
        prisma.chatSession.findMany.mockResolvedValue([]);

        await service.getUserChatSessions('u1', { limit });

        expect(prisma.chatSession.findMany.mock.calls[0][0].take).toBe(21);
      },
    );

    it('falls back to the default for a non-numeric limit', async () => {
      prisma.chatSession.findMany.mockResolvedValue([]);

      await service.getUserChatSessions('u1', {
        limit: Number('abc'),
      });

      expect(prisma.chatSession.findMany.mock.calls[0][0].take).toBe(21);
    });

    it('truncates a fractional limit', async () => {
      prisma.chatSession.findMany.mockResolvedValue([]);

      await service.getUserChatSessions('u1', { limit: 7.8 });

      expect(prisma.chatSession.findMany.mock.calls[0][0].take).toBe(8);
    });
  });
});
