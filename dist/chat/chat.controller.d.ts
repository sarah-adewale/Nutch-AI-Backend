import { ChatService } from './chat.service';
import { AuthUser } from '../auth/auth.service';
export declare class ChatController {
    private chatService;
    constructor(chatService: ChatService);
    getUserChatSessions(user: AuthUser): Promise<({
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
    getChatSession(sessionId: string, user: AuthUser): Promise<{
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
    deleteChatSession(sessionId: string, user: AuthUser): Promise<{
        success: boolean;
    }>;
    searchChatHistory(query: string, user: AuthUser): Promise<({
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
