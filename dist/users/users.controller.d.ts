import { UsersService } from './users.service';
import { AuthUser } from '../auth/auth.service';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getProfile(user: AuthUser): Promise<{
        isAnonymous: boolean;
        chatSessionCount: number;
        fileCount: number;
        limits: {
            maxChatSessions: number;
            maxFiles: number;
        };
        id: string;
        email: string | null;
        authProvider: string | null;
        createdAt: Date;
        updatedAt: Date;
        subscriptionTier: string;
    }>;
}
