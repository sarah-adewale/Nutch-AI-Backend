import { PrismaService } from '../database/prisma.service';
import { PrismaClient } from '@prisma/client';
type User = NonNullable<Awaited<ReturnType<PrismaClient['user']['findUnique']>>>;
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    create(data: {
        email?: string | null;
        authProvider?: string | null;
        subscriptionTier?: string;
    }): Promise<User>;
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    update(id: string, data: {
        email?: string | null;
        authProvider?: string | null;
        subscriptionTier?: string;
        updatedAt?: Date;
    }): Promise<User>;
    isAnonymous(userId: string): Promise<boolean>;
    getUserChatSessionCount(userId: string): Promise<number>;
    getUserFileCount(userId: string): Promise<number>;
}
export {};
