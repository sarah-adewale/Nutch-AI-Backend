import { ConfigService } from '@nestjs/config';
export declare class OpenAiService {
    private configService;
    private openai;
    constructor(configService: ConfigService);
    generateResponse(prompt: string, model?: string): Promise<{
        response: string;
        model_used: string;
        timestamp: string;
    }>;
    generateWithContext(prompt: string, context: string, model?: string): Promise<{
        response: string;
        model_used: string;
        timestamp: string;
    }>;
}
