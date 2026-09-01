import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LimitsService } from '../limits/limits.service';
import { EncryptionService } from '../encryption/encryption.service';
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
    private encryption: EncryptionService,
  ) {}

  async createFile(
    userId: string,
    filename: string,
    content: string,
    fileType: string,
  ) {
    await this.limits.assertCanCreate(userId, 'files');

    // Size is measured on the plaintext, so what a person sees matches the
    // file they downloaded rather than the ciphertext envelope.
    const size = Buffer.byteLength(content, 'utf-8');
    const offload = size > S3_OFFLOAD_THRESHOLD_BYTES;

    // File bodies are encrypted at rest (ADR 001). They are never searched, so
    // unlike message content nothing is lost by doing so.
    const sealed = this.encryption.encrypt(content);

    const file = await this.prisma.file.create({
      data: {
        userId,
        filename,
        // Offloaded bodies are not duplicated into the column; the row keeps a
        // pointer instead, which is what makes the offload actually save space.
        content: offload ? '' : sealed,
        fileType,
        folder: this.determineFolder(fileType),
        size,
      },
    });

    if (!offload) return file;

    const storageKey = await this.s3Service.uploadFile(file.id, sealed);

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

    const sealed = file.storageKey
      ? await this.s3Service.getFile(file.storageKey)
      : file.content;

    return { file, content: this.encryption.decrypt(sealed) };
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
