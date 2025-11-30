"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiRouterController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const ai_router_service_1 = require("./ai-router.service");
const prompt_request_dto_1 = require("./dto/prompt-request.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let AiRouterController = class AiRouterController {
    constructor(aiRouterService) {
        this.aiRouterService = aiRouterService;
    }
    async processPrompt(promptRequest, user) {
        promptRequest.user_id = user.id;
        return this.aiRouterService.processPrompt(promptRequest);
    }
};
exports.AiRouterController = AiRouterController;
__decorate([
    (0, common_1.Post)('prompt'),
    (0, swagger_1.ApiOperation)({
        summary: 'Process AI prompt',
        description: 'Send a prompt to AI models for processing. Supports text, code, and image input types.',
    }),
    (0, swagger_1.ApiBody)({ type: prompt_request_dto_1.PromptRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Prompt queued for processing',
        schema: {
            type: 'object',
            properties: {
                jobId: { type: 'string', example: '12345' },
                status: { type: 'string', example: 'processing' },
                message: { type: 'string', example: 'Request queued for processing' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({
        status: 429,
        description: 'Too Many Requests - Rate limit exceeded',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [prompt_request_dto_1.PromptRequestDto, Object]),
    __metadata("design:returntype", Promise)
], AiRouterController.prototype, "processPrompt", null);
exports.AiRouterController = AiRouterController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, swagger_1.ApiBearerAuth)('JWT-auth'),
    (0, common_1.Controller)('ai'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard, (0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [ai_router_service_1.AiRouterService])
], AiRouterController);
//# sourceMappingURL=ai-router.controller.js.map