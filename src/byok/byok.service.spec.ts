import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { UsersService } from '../users/users.service';
import { OpenAiService } from '../ai-router/providers/openai.service';
import { AnthropicService } from '../ai-router/providers/anthropic.service';
import { ByokService } from './byok.service';

describe('ByokService', () => {
  let service: ByokService;
  let prisma: {
    byokKey: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock };
  let users: { isAnonymous: jest.Mock };
  let anthropic: { validateKey: jest.Mock };
  let openai: { validateKey: jest.Mock };

  beforeEach(() => {
    prisma = {
      byokKey: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ createdAt: new Date(0) }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    encryption = {
      encrypt: jest.fn().mockReturnValue('v1.enc'),
      decrypt: jest.fn().mockReturnValue('sk-ant-decrypted'),
    };
    users = { isAnonymous: jest.fn().mockResolvedValue(false) };
    anthropic = { validateKey: jest.fn().mockResolvedValue(true) };
    openai = { validateKey: jest.fn().mockResolvedValue(true) };

    service = new ByokService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
      users as unknown as UsersService,
      openai as unknown as OpenAiService,
      anthropic as unknown as AnthropicService,
    );
  });

  describe('anonymous users', () => {
    beforeEach(() => users.isAnonymous.mockResolvedValue(true));

    it('cannot list keys', async () => {
      await expect(service.list('u1')).rejects.toThrow(ForbiddenException);
    });

    it('cannot store a key', async () => {
      await expect(
        service.upsert('u1', 'anthropic', 'sk-ant-1234'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.byokKey.upsert).not.toHaveBeenCalled();
    });

    it('cannot delete a key', async () => {
      await expect(service.remove('u1', 'anthropic')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('upsert', () => {
    it('validates the key against the provider before storing', async () => {
      await service.upsert('u1', 'anthropic', 'sk-ant-1234');

      expect(anthropic.validateKey).toHaveBeenCalledWith('sk-ant-1234');
      expect(prisma.byokKey.upsert).toHaveBeenCalled();
    });

    it('refuses a key the provider rejects', async () => {
      anthropic.validateKey.mockResolvedValue(false);

      await expect(service.upsert('u1', 'anthropic', 'sk-bad')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.byokKey.upsert).not.toHaveBeenCalled();
    });

    it('routes validation to the matching provider', async () => {
      await service.upsert('u1', 'openai', 'sk-proj-1234');

      expect(openai.validateKey).toHaveBeenCalled();
      expect(anthropic.validateKey).not.toHaveBeenCalled();
    });

    it('encrypts before storing and never writes plaintext', async () => {
      await service.upsert('u1', 'anthropic', 'sk-ant-1234');

      expect(encryption.encrypt).toHaveBeenCalledWith('sk-ant-1234');
      const [args] = prisma.byokKey.upsert.mock.calls[0];
      expect(args.create.encryptedKey).toBe('v1.enc');
      expect(JSON.stringify(args)).not.toContain('sk-ant-1234');
    });

    it('keeps only the last four characters as a hint', async () => {
      const result = await service.upsert('u1', 'anthropic', 'sk-ant-abcd9999');

      expect(result.hint).toBe('9999');
      const [args] = prisma.byokKey.upsert.mock.calls[0];
      expect(args.create.keyMetadata).toEqual({ hint: '9999' });
    });

    it('trims surrounding whitespace from a pasted key', async () => {
      await service.upsert('u1', 'anthropic', '  sk-ant-1234\n');

      expect(anthropic.validateKey).toHaveBeenCalledWith('sk-ant-1234');
    });

    it('replaces an existing key for the same provider', async () => {
      await service.upsert('u1', 'anthropic', 'sk-ant-1234');

      const [args] = prisma.byokKey.upsert.mock.calls[0];
      expect(args.where).toEqual({
        userId_provider: { userId: 'u1', provider: 'anthropic' },
      });
      expect(args.update.encryptedKey).toBe('v1.enc');
    });
  });

  describe('list', () => {
    it('never selects the encrypted key', async () => {
      await service.list('u1');

      const [args] = prisma.byokKey.findMany.mock.calls[0];
      expect(args.select.encryptedKey).toBeUndefined();
    });

    it('returns provider and hint only', async () => {
      prisma.byokKey.findMany.mockResolvedValue([
        {
          provider: 'anthropic',
          keyMetadata: { hint: '9999' },
          createdAt: new Date(0),
        },
      ]);

      const [key] = await service.list('u1');

      expect(key).toEqual({
        provider: 'anthropic',
        hint: '9999',
        createdAt: new Date(0),
      });
    });

    it('tolerates a record with no metadata', async () => {
      prisma.byokKey.findMany.mockResolvedValue([
        { provider: 'openai', keyMetadata: null, createdAt: new Date(0) },
      ]);

      expect((await service.list('u1'))[0].hint).toBe('');
    });
  });

  describe('remove', () => {
    it('deletes the key for that provider only', async () => {
      await service.remove('u1', 'anthropic');

      expect(prisma.byokKey.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', provider: 'anthropic' },
      });
    });

    it('reports 404 when nothing was connected', async () => {
      prisma.byokKey.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove('u1', 'anthropic')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('decryptFor', () => {
    it('returns undefined when the user has no key', async () => {
      await expect(
        service.decryptFor('u1', 'anthropic'),
      ).resolves.toBeUndefined();
    });

    it('decrypts a stored key', async () => {
      prisma.byokKey.findUnique.mockResolvedValue({ encryptedKey: 'v1.enc' });

      await expect(service.decryptFor('u1', 'anthropic')).resolves.toBe(
        'sk-ant-decrypted',
      );
    });

    it('falls back to undefined when a record cannot be decrypted', async () => {
      // A rotated ENCRYPTION_KEY should degrade to the Nutch key rather than
      // breaking every prompt.
      prisma.byokKey.findUnique.mockResolvedValue({ encryptedKey: 'v1.enc' });
      encryption.decrypt.mockImplementation(() => {
        throw new Error('bad auth tag');
      });

      await expect(
        service.decryptFor('u1', 'anthropic'),
      ).resolves.toBeUndefined();
    });
  });

  describe('providersWithKeys', () => {
    it('reports which providers have a connected key', async () => {
      prisma.byokKey.findMany.mockResolvedValue([{ provider: 'anthropic' }]);

      const result = await service.providersWithKeys('u1');

      expect(result.has('anthropic')).toBe(true);
      expect(result.has('openai')).toBe(false);
    });
  });
});
