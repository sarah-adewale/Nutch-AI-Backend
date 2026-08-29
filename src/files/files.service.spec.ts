import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FilesService } from './files.service';
import { S3Service } from './s3.service';

describe('FilesService', () => {
  let service: FilesService;
  let prisma: {
    file: {
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let s3: { uploadFile: jest.Mock; deleteFile: jest.Mock };

  beforeEach(() => {
    prisma = {
      file: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'f1', ...data })),
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    s3 = {
      uploadFile: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    service = new FilesService(
      prisma as unknown as PrismaService,
      s3 as unknown as S3Service,
    );
  });

  describe('folder assignment', () => {
    it.each(['js', 'ts', 'py', 'java', 'cpp', 'html', 'css', 'json', 'xml'])(
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
    it('keeps a small file out of S3', async () => {
      await service.createFile('u1', 'a.txt', 'small', 'txt');
      expect(s3.uploadFile).not.toHaveBeenCalled();
    });

    it('offloads content above the 100KB threshold', async () => {
      const big = 'x'.repeat(1024 * 100 + 1);
      await service.createFile('u1', 'big.txt', big, 'txt');
      expect(s3.uploadFile).toHaveBeenCalledWith('f1', big);
    });

    it('does not offload content sitting exactly on the threshold', async () => {
      await service.createFile('u1', 'edge.txt', 'x'.repeat(1024 * 100), 'txt');
      expect(s3.uploadFile).not.toHaveBeenCalled();
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
      prisma.file.findFirst.mockResolvedValue({ id: 'f1' });

      await service.deleteFile('u1', 'f1');

      expect(prisma.file.findFirst).toHaveBeenCalledWith({
        where: { id: 'f1', userId: 'u1' },
      });
    });

    it('removes the row and the S3 object together', async () => {
      prisma.file.findFirst.mockResolvedValue({ id: 'f1' });

      await expect(service.deleteFile('u1', 'f1')).resolves.toEqual({
        success: true,
      });
      expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
      expect(s3.deleteFile).toHaveBeenCalledWith('f1');
    });
  });
});
