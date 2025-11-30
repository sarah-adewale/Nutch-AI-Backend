import { AiRouterService } from './ai-router.service';
import { PromptRequestDto } from './dto/prompt-request.dto';
import { AuthUser } from '../auth/auth.service';
export declare class AiRouterController {
    private aiRouterService;
    constructor(aiRouterService: AiRouterService);
    processPrompt(promptRequest: PromptRequestDto, user: AuthUser): Promise<any>;
}
