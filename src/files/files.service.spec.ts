import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LimitsService } from '../limits/limits.service';
import { EncryptionService } from '../encryption/encryption.service';
import { FilesService } from './files.service';
import { S3Service } from './s3.service';

const OVER_THRESHOLD = 'x'.repeat(1024 * 100 + 1);

/**
 * Stand-in for the real cipher. Base64 rather than a wrapper that embeds the
 * plaintext, so "never stores plaintext" assertions actually test something.
 */
const seal = (v: string) => `v1.${Buffer.from(v, 'utf8').toString('base64')}`;
const unseal = (v: string) =>
  Buffer.from(v.slice(3), 'base64').toString('utf8');

describe('FilesService', () => {
  let service: FilesService;
  let prisma: {
    file: {
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let s3: { uploadFile: jest.Mock; deleteFile: jest.Mock; getFile: jest.Mock };
  let limits: { assertCanCreate: jest.Mock };
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock };

  beforeEach(() => {
    prisma = {
      file: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'f1', ...data })),
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'f1', ...data })),
      },
    };
    s3 = {
      uploadFile: jest.fn().mockResolvedValue('files/f1'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getFile: jest.fn().mockResolvedValue(seal('body from s3')),
    };
    limits = { assertCanCreate: jest.fn().mockResolvedValue(undefined) };
    encryption = {
      encrypt: jest.fn().mockImplementation(seal),
      decrypt: jest.fn().mockImplementation(unseal),
    };

    service = new FilesService(
      prisma as unknown as PrismaService,
      s3 as unknown as S3Service,
      limits as unknown as LimitsService,
      encryption as unknown as EncryptionService,
    );
  });

  describe('folder assignment', () => {
    it.each(['js', 'ts', 'py', 'go', 'rs', 'html', 'css', 'json', 'sql'])(
      'files a .%s output under /code',
      async (ext) => {
        const file = await service.createFile('u1', `out.${ext}`, 'x', ext);
        expect(file.folder).toBe('/code');
      },
    );

    it.each(['txt', 'md', 'pdf'])(
      'files a .%s output under /documents',
      async (ext) => {
        const file = await service.createFile('u1', `out.${ext}`, 'x', ext);
        expect(file.folder).toBe('/documents');
      },
    );

    it('ignores the case of the extension', async () => {
      const file = await service.createFile('u1', 'App.TS', 'x', 'TS');
      expect(file.folder).toBe('/code');
    });
  });

  describe('S3 offload', () => {
    it('keeps a small file inline and out of S3', async () => {
      await service.createFile('u1', 'a.txt', 'small', 'txt');

      expect(s3.uploadFile).not.toHaveBeenCalled();
      expect(prisma.file.create.mock.calls[0][0].data.content).toBe(
        seal('small'),
      );
    });

    it('does not offload content sitting exactly on the threshold', async () => {
      await service.createFile('u1', 'edge.txt', 'x'.repeat(1024 * 100), 'txt');
      expect(s3.uploadFile).not.toHaveBeenCalled();
    });

    it('offloads content above the threshold', async () => {
      await service.createFile('u1', 'big.txt', OVER_THRESHOLD, 'txt');
      expect(s3.uploadFile).toHaveBeenCalledWith('f1', seal(OVER_THRESHOLD));
    });

    it('does not duplicate an offloaded body into the database column', async () => {
      await service.createFile('u1', 'big.txt', OVER_THRESHOLD, 'txt');

      const { data } = prisma.file.create.mock.calls[0][0];
      expect(data.content).toBe('');
      expect(data.size).toBe(OVER_THRESHOLD.length);
    });

    it('records the storage key S3 returned', async () => {
      await service.createFile('u1', 'big.txt', OVER_THRESHOLD, 'txt');

      expect(prisma.file.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { storageKey: 'files/f1' },
      });
    });

    it('measures size in bytes, not characters', async () => {
      await service.createFile('u1', 'u.txt', '🔑', 'txt');

      expect(prisma.file.create.mock.calls[0][0].data.size).toBe(4);
    });
  });

  describe('limits', () => {
    it('checks the quota before creating anything', async () => {
      limits.assertCanCreate.mockRejectedValue(new Error('over quota'));

      await expect(
        service.createFile('u1', 'a.txt', 'x', 'txt'),
      ).rejects.toThrow('over quota');
      expect(prisma.file.create).not.toHaveBeenCalled();
    });

    it('checks the files resource specifically', async () => {
      await service.createFile('u1', 'a.txt', 'x', 'txt');
      expect(limits.assertCanCreate).toHaveBeenCalledWith('u1', 'files');
    });
  });

  describe('getUserFiles', () => {
    it('does not select the body when listing', async () => {
      await service.getUserFiles('u1');

      const [args] = prisma.file.findMany.mock.calls[0];
      expect(args.select.content).toBeUndefined();
      expect(args.where).toEqual({ userId: 'u1' });
    });
  });

  describe('getFileContent', () => {
    it('reads an inline body straight from the row', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: 'f1',
        filename: 'a.txt',
        content: seal('inline body'),
        storageKey: null,
      });

      const { content } = await service.getFileContent('u1', 'f1');

      expect(content).toBe('inline body');
      expect(s3.getFile).not.toHaveBeenCalled();
    });

    it('fetches an offloaded body from S3', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: 'f1',
        filename: 'big.txt',
        content: '',
        storageKey: 'files/f1',
      });

      const { content } = await service.getFileContent('u1', 'f1');

      expect(s3.getFile).toHaveBeenCalledWith('files/f1');
      expect(content).toBe('body from s3');
    });

    it('throws NotFoundException for a file owned by someone else', async () => {
      prisma.file.findFirst.mockResolvedValue(null);

      await expect(service.getFileContent('u1', 'f1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('scopes the lookup to the owner', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: 'f1',
        content: seal('x'),
        storageKey: null,
      });

      await service.getFileContent('u1', 'f1');

      expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: 'f1', userId: 'u1' },
      });
    });
  });

  describe('deleteFile', () => {
    it('throws NotFoundException when the file is missing', async () => {
      prisma.file.findFirst.mockResolvedValue(null);

      await expect(service.deleteFile('u1', 'f1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('leaves S3 untouched when the row does not exist', async () => {
      prisma.file.findFirst.mockResolvedValue(null);

      await expect(service.deleteFile('u1', 'f1')).rejects.toThrow();
      expect(s3.deleteFile).not.toHaveBeenCalled();
    });

    it('scopes deletion to the owning user', async () => {
      prisma.file.findFirst.mockResolvedValue({ id: 'f1', storageKey: null });

      await service.deleteFile('u1', 'f1');

      expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: 'f1', userId: 'u1' },
      });
    });

    it('removes the row and the S3 object together', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: 'f1',
        storageKey: 'files/f1',
      });

      await expect(service.deleteFile('u1', 'f1')).resolves.toEqual({
        success: true,
      });
      expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
      expect(s3.deleteFile).toHaveBeenCalledWith('files/f1');
    });

    it('skips S3 for a file that was never offloaded', async () => {
      prisma.file.findFirst.mockResolvedValue({ id: 'f1', storageKey: null });

      await service.deleteFile('u1', 'f1');

      expect(s3.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('encryption at rest (ADR 001)', () => {
    it('never writes a plaintext body to the database', async () => {
      await service.createFile('u1', 'secret.txt', 'confidential notes', 'txt');

      const { data } = prisma.file.create.mock.calls[0][0];
      expect(data.content).not.toContain('confidential notes');
      expect(encryption.encrypt).toHaveBeenCalledWith('confidential notes');
    });

    it('never uploads a plaintext body to S3', async () => {
      await service.createFile('u1', 'big.txt', OVER_THRESHOLD, 'txt');

      const [, uploaded] = s3.uploadFile.mock.calls[0];
      expect(uploaded).not.toContain(OVER_THRESHOLD);
      expect(uploaded.startsWith('v1.')).toBe(true);
    });

    it('records the plaintext size, not the ciphertext size', async () => {
      // Otherwise the size shown to a person would not match what they
      // downloaded.
      await service.createFile('u1', 'a.txt', 'hello', 'txt');

      expect(prisma.file.create.mock.calls[0][0].data.size).toBe(5);
    });

    it('decrypts on the way out', async () => {
      prisma.file.findFirst.mockResolvedValue({
        id: 'f1',
        filename: 'a.txt',
        content: seal('round trip'),
        storageKey: null,
      });

      const { content } = await service.getFileContent('u1', 'f1');

      expect(content).toBe('round trip');
    });
  });
});
