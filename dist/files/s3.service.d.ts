import { ConfigService } from '@nestjs/config';
export declare class S3Service {
    private configService;
    private s3Client;
    private bucketName;
    constructor(configService: ConfigService);
    uploadFile(fileId: string, content: string): Promise<void>;
    deleteFile(fileId: string): Promise<void>;
}
