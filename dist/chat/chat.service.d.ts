import { PrismaService } from '../database/prisma.service';
export declare class ChatService {
    private prisma;
    constructor(prisma: PrismaService);
    createChatSession(userId: string, modelUsed: string, title?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string | null;
        modelUsed: string;
    }>;
    addMessage(sessionId: string, role: 'user' | 'assistant', content: string, inputType?: string, context?: string, modelUsed?: string): Promise<{
        id: string;
        modelUsed: string | null;
        content: string;
        context: string | null;
        timestamp: Date;
        role: string;
        inputType: string | null;
        sessionId: string;
    }>;
    getUserChatSessions(userId: string): Promise<({
        messages: {
            id: string;
            modelUsed: string | null;
            content: string;
            context: string | null;
            timestamp: Date;
            role: string;
            inputType: string | null;
            sessionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string | null;
        modelUsed: string;
    })[]>;
    getChatSession(sessionId: string, userId: string): Promise<{
        messages: {
            id: string;
            modelUsed: string | null;
            content: string;
            context: string | null;
            timestamp: Date;
            role: string;
            inputType: string | null;
            sessionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string | null;
        modelUsed: string;
    }>;
    deleteChatSession(sessionId: string, userId: string): Promise<{
        success: boolean;
    }>;
    searchChatHistory(userId: string, query: string): Promise<({
        session: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            title: string | null;
            modelUsed: string;
        };
    } & {
        id: string;
        modelUsed: string | null;
        content: string;
        context: string | null;
        timestamp: Date;
        role: string;
        inputType: string | null;
        sessionId: string;
    })[]>;
}
