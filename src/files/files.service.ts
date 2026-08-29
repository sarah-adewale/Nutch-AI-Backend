import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { S3Service } from './s3.service';

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
  ) {}

  async createFile(
    userId: string,
    filename: string,
    content: string,
    fileType: string,
  ) {
    // Auto-organize into folders based on file type
    const folder = this.determineFolder(fileType);

    // Store in database
    const file = await this.prisma.file.create({
      data: {
        userId,
        filename,
        content,
        fileType,
        folder,
      },
    });

    // Optionally store large files in S3
    if (content.length > 1024 * 100) {
      // 100KB threshold
      await this.s3Service.uploadFile(file.id, content);
    }

    return file;
  }

  private determineFolder(fileType: string): string {
    const codeTypes = [
      'js',
      'ts',
      'py',
      'java',
      'cpp',
      'html',
      'css',
      'json',
      'xml',
    ];
    return codeTypes.includes(fileType.toLowerCase()) ? '/code' : '/documents';
  }

  async getUserFiles(userId: string) {
    return this.prisma.file.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteFile(userId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    await this.prisma.file.delete({
      where: { id: fileId },
    });

    // Also delete from S3 if stored there
    await this.s3Service.deleteFile(fileId);

    return { success: true };
  }
}
