import { PrismaService } from '../database/prisma.service';
import { S3Service } from './s3.service';
export declare class FilesService {
    private prisma;
    private s3Service;
    constructor(prisma: PrismaService, s3Service: S3Service);
    createFile(userId: string, filename: string, content: string, fileType: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        filename: string;
        folder: string;
        content: string;
        fileType: string;
    }>;
    private determineFolder;
    getUserFiles(userId: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        filename: string;
        folder: string;
        content: string;
        fileType: string;
    }[]>;
    deleteFile(userId: string, fileId: string): Promise<{
        success: boolean;
    }>;
}
