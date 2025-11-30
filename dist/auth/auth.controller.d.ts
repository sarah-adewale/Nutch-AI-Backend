import { Request, Response } from 'express';
import { AuthService } from './auth.service';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    googleAuth(): Promise<void>;
    googleAuthCallback(req: Request, res: Response): Promise<void>;
    githubAuth(): Promise<void>;
    githubAuthCallback(req: Request, res: Response): Promise<void>;
    createAnonymousSession(): Promise<{
        access_token: string;
        user: import("./auth.service").AuthUser;
    }>;
}
