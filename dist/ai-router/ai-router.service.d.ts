import { PromptRequestDto } from './dto/prompt-request.dto';
import { AiResponseDto } from './dto/ai-response.dto';
export declare class AiRouterService {
    constructor();
    processPrompt(promptRequest: PromptRequestDto): Promise<AiResponseDto | any>;
}
