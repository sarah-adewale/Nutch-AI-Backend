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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const users_service_1 = require("./users.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let UsersController = class UsersController {
    constructor(usersService) {
        this.usersService = usersService;
    }
    async getProfile(user) {
        const userProfile = await this.usersService.findById(user.id);
        const isAnonymous = await this.usersService.isAnonymous(user.id);
        const chatSessionCount = await this.usersService.getUserChatSessionCount(user.id);
        const fileCount = await this.usersService.getUserFileCount(user.id);
        return {
            ...userProfile,
            isAnonymous,
            chatSessionCount,
            fileCount,
            limits: {
                maxChatSessions: isAnonymous ? 3 : -1,
                maxFiles: isAnonymous ? 5 : -1,
            },
        };
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)('profile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get user profile',
        description: 'Returns user profile with usage statistics and account limits',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'User profile retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                id: { type: 'string', example: 'cmi8tb6tv0000rdimxbtp39do' },
                email: { type: 'string', example: 'user@example.com', nullable: true },
                authProvider: { type: 'string', example: 'google', nullable: true },
                subscriptionTier: { type: 'string', example: 'free' },
                isAnonymous: { type: 'boolean', example: false },
                chatSessionCount: { type: 'number', example: 5 },
                fileCount: { type: 'number', example: 12 },
                limits: {
                    type: 'object',
                    properties: {
                        maxChatSessions: {
                            type: 'number',
                            example: -1,
                            description: '-1 means unlimited',
                        },
                        maxFiles: {
                            type: 'number',
                            example: -1,
                            description: '-1 means unlimited',
                        },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getProfile", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, swagger_1.ApiBearerAuth)('JWT-auth'),
    (0, common_1.Controller)('users'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map