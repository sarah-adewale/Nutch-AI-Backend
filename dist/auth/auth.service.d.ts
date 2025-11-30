import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
export interface AuthUser {
    id: string;
    email?: string;
    authProvider?: string;
}
export declare class AuthService {
    private jwtService;
    private usersService;
    constructor(jwtService: JwtService, usersService: UsersService);
    login(user: any): Promise<{
        access_token: string;
        user: AuthUser;
    }>;
    createAnonymousUser(): Promise<{
        access_token: string;
        user: AuthUser;
    }>;
    validateUser(payload: AuthUser): Promise<Awaited<ReturnType<UsersService['findById']>>>;
}
