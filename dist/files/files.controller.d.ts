import { FilesService } from './files.service';
import { AuthUser } from '../auth/auth.service';
export declare class FilesController {
    private filesService;
    constructor(filesService: FilesService);
    getUserFiles(user: AuthUser): Promise<{
        id: string;
        userId: string;
        filename: string;
        folder: string;
        content: string;
        fileType: string;
        createdAt: Date;
    }[]>;
    deleteFile(fileId: string, user: AuthUser): Promise<{
        success: boolean;
    }>;
}
