import { Job } from 'bullmq';
import { PromptRequestDto } from './dto/prompt-request.dto';
export declare class AiProcessor {
    handleAiRequest(job: Job<PromptRequestDto>): Promise<{
        response: string;
        model_used: string;
        timestamp: string;
        file_type: string;
        folder: string;
    }>;
}
