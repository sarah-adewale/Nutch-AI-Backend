import { PrismaService } from '../database/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    chatSession: { count: jest.Mock };
    file: { count: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      chatSession: { count: jest.fn().mockResolvedValue(0) },
      file: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('isAnonymous', () => {
    it('treats an account without an email as anonymous', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: null });

      await expect(service.isAnonymous('u1')).resolves.toBe(true);
    });

    it('treats an account with an email as identified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
      });

      await expect(service.isAnonymous('u1')).resolves.toBe(false);
    });

    it('treats a missing account as anonymous rather than throwing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.isAnonymous('nope')).resolves.toBe(true);
    });
  });

  describe('findByEmail', () => {
    it('short-circuits on an empty email instead of querying', async () => {
      await expect(service.findByEmail('')).resolves.toBeNull();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('queries by unique email when one is given', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await service.findByEmail('a@b.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'a@b.com' },
      });
    });
  });

  describe('usage counts', () => {
    it('counts sessions belonging to the user', async () => {
      prisma.chatSession.count.mockResolvedValue(3);

      await expect(service.getUserChatSessionCount('u1')).resolves.toBe(3);
      expect(prisma.chatSession.count).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('counts files belonging to the user', async () => {
      prisma.file.count.mockResolvedValue(5);

      await expect(service.getUserFileCount('u1')).resolves.toBe(5);
      expect(prisma.file.count).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });
  });
});
