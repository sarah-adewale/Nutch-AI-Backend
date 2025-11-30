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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
let ChatService = class ChatService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createChatSession(userId, modelUsed, title) {
        return this.prisma.chatSession.create({
            data: {
                userId,
                modelUsed,
                title,
            },
        });
    }
    async addMessage(sessionId, role, content, inputType, context, modelUsed) {
        return this.prisma.message.create({
            data: {
                sessionId,
                role,
                content,
                inputType,
                context,
                modelUsed,
            },
        });
    }
    async getUserChatSessions(userId) {
        return this.prisma.chatSession.findMany({
            where: { userId },
            include: {
                messages: {
                    orderBy: { timestamp: 'asc' },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });
    }
    async getChatSession(sessionId, userId) {
        return this.prisma.chatSession.findFirst({
            where: { id: sessionId, userId },
            include: {
                messages: {
                    orderBy: { timestamp: 'asc' },
                },
            },
        });
    }
    async deleteChatSession(sessionId, userId) {
        const session = await this.prisma.chatSession.findFirst({
            where: { id: sessionId, userId },
        });
        if (!session) {
            throw new Error('Chat session not found');
        }
        await this.prisma.chatSession.delete({
            where: { id: sessionId },
        });
        return { success: true };
    }
    async searchChatHistory(userId, query) {
        return this.prisma.message.findMany({
            where: {
                session: {
                    userId,
                },
                content: {
                    contains: query,
                    mode: 'insensitive',
                },
            },
            include: {
                session: true,
            },
            orderBy: { timestamp: 'desc' },
            take: 50,
        });
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ChatService);
//# sourceMappingURL=chat.service.js.map