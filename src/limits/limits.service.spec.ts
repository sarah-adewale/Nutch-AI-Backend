import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { LimitExceededException } from './limit-exceeded.exception';
import { LimitsService, UNLIMITED } from './limits.service';

describe('LimitsService', () => {
  let service: LimitsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    chatSession: { count: jest.Mock };
    file: { count: jest.Mock };
  };

  const config = (values: Record<string, unknown> = {}) =>
    ({
      get: (key: string) => values[key],
    }) as unknown as ConfigService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: null }) },
      chatSession: { count: jest.fn().mockResolvedValue(0) },
      file: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new LimitsService(prisma as unknown as PrismaService, config());
  });

  describe('limitsFor', () => {
    it('caps anonymous users at 3 sessions and 5 files', () => {
      expect(service.limitsFor(true)).toEqual({
        maxChatSessions: 3,
        maxFiles: 5,
      });
    });

    it('leaves signed-in users unlimited', () => {
      expect(service.limitsFor(false)).toEqual({
        maxChatSessions: UNLIMITED,
        maxFiles: UNLIMITED,
      });
    });

    it('honours configured overrides', () => {
      const configured = new LimitsService(
        prisma as unknown as PrismaService,
        config({ MAX_CHAT_SESSIONS_ANONYMOUS: 10, MAX_FILES_ANONYMOUS: 20 }),
      );

      expect(configured.limitsFor(true)).toEqual({
        maxChatSessions: 10,
        maxFiles: 20,
      });
    });

    it('coerces string values from the environment to numbers', () => {
      // process.env always yields strings; an uncoerced "3" would be sent to
      // the extension as a string and compared by JS coercion.
      const configured = new LimitsService(
        prisma as unknown as PrismaService,
        config({ MAX_CHAT_SESSIONS_ANONYMOUS: '7', MAX_FILES_ANONYMOUS: '9' }),
      );

      expect(configured.limitsFor(true)).toEqual({
        maxChatSessions: 7,
        maxFiles: 9,
      });
    });

    it('falls back when the configured value is not a number', () => {
      const configured = new LimitsService(
        prisma as unknown as PrismaService,
        config({ MAX_CHAT_SESSIONS_ANONYMOUS: 'lots' }),
      );

      expect(configured.limitsFor(true).maxChatSessions).toBe(3);
    });
  });

  describe('assertCanCreate', () => {
    it('allows an anonymous user below the cap', async () => {
      prisma.chatSession.count.mockResolvedValue(2);

      await expect(
        service.assertCanCreate('u1', 'chat_sessions'),
      ).resolves.toBeUndefined();
    });

    it('blocks an anonymous user at the cap', async () => {
      prisma.chatSession.count.mockResolvedValue(3);

      await expect(
        service.assertCanCreate('u1', 'chat_sessions'),
      ).rejects.toThrow(LimitExceededException);
    });

    it('blocks when already over the cap', async () => {
      prisma.file.count.mockResolvedValue(9);

      await expect(service.assertCanCreate('u1', 'files')).rejects.toThrow(
        LimitExceededException,
      );
    });

    it('never counts for a signed-in user', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'a@b.com' });

      await service.assertCanCreate('u1', 'files');

      expect(prisma.file.count).not.toHaveBeenCalled();
    });

    it('treats a deleted account as anonymous rather than throwing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.file.count.mockResolvedValue(5);

      await expect(service.assertCanCreate('gone', 'files')).rejects.toThrow(
        LimitExceededException,
      );
    });
  });

  describe('LimitExceededException', () => {
    it('carries the numbers the sidebar needs to explain itself', () => {
      const err = new LimitExceededException('files', 5, 5);

      expect(err.getStatus()).toBe(403);
      expect(err.getResponse()).toEqual({
        error: 'LIMIT_REACHED',
        message: expect.stringContaining('5 stored files'),
        resource: 'files',
        limit: 5,
        current: 5,
        action: 'sign_in',
      });
    });
  });
});
