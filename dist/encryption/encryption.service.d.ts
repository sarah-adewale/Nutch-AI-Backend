import { ConfigService } from '@nestjs/config';
export declare class EncryptionService {
    private configService;
    private readonly encryptionKey;
    constructor(configService: ConfigService);
    encrypt(text: string): string;
    decrypt(encryptedText: string): string;
}
