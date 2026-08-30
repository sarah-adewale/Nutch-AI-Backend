import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LimitsService } from '../limits/limits.service';
import { S3Service } from './s3.service';

/** Bodies larger than this live in S3 rather than in a Postgres column. */
export const S3_OFFLOAD_THRESHOLD_BYTES = 1024 * 100;

const CODE_TYPES = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'java',
  'cpp',
  'c',
  'cs',
  'go',
  'rb',
  'rs',
  'php',
  'sh',
  'sql',
  'html',
  'css',
  'scss',
  'json',
  'yaml',
  'yml',
  'xml',
]);

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private limits: LimitsService,
  ) {}

  async createFile(
    userId: string,
    filename: string,
    content: string,
    fileType: string,
  ) {
    await this.limits.assertCanCreate(userId, 'files');

    const size = Buffer.byteLength(content, 'utf-8');
    const offload = size > S3_OFFLOAD_THRESHOLD_BYTES;

    const file = await this.prisma.file.create({
      data: {
        userId,
        filename,
        // Offloaded bodies are not duplicated into the column; the row keeps a
        // pointer instead, which is what makes the offload actually save space.
        content: offload ? '' : content,
        fileType,
        folder: this.determineFolder(fileType),
        size,
      },
    });

    if (!offload) return file;

    const storageKey = await this.s3Service.uploadFile(file.id, content);

    return this.prisma.file.update({
      where: { id: file.id },
      data: { storageKey },
    });
  }

  private determineFolder(fileType: string): string {
    return CODE_TYPES.has(fileType.toLowerCase()) ? '/code' : '/documents';
  }

  async getUserFiles(userId: string) {
    return this.prisma.file.findMany({
      where: { userId },
      // The body is never needed to render a file list.
      select: {
        id: true,
        filename: true,
        folder: true,
        fileType: true,
        size: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Resolves the body, reading from S3 when the file was offloaded. */
  async getFileContent(userId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const content = file.storageKey
      ? await this.s3Service.getFile(file.storageKey)
      : file.content;

    return { file, content };
  }

  async deleteFile(userId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    await this.prisma.file.delete({ where: { id: fileId } });

    // Only offloaded files have an object to remove.
    if (file.storageKey) {
      await this.s3Service.deleteFile(file.storageKey);
    }

    return { success: true };
  }
}
