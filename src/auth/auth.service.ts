import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';

export interface AuthUser {
  id: string;
  email?: string;
  authProvider?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {}

  async login(user: any) {
    const existingUser = await this.usersService.findByEmail(user.email);

    const dbUser =
      existingUser ??
      (await this.usersService.create({
        email: user.email,
        authProvider: user.provider,
      }));

    const payload: AuthUser = {
      id: dbUser.id,
      email: dbUser.email,
      authProvider: dbUser.authProvider,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: payload,
    };
  }

  async createAnonymousUser() {
    const user = await this.usersService.create({
      authProvider: null,
      email: null,
    });

    const payload: AuthUser = {
      id: user.id,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: payload,
    };
  }

  /**
   * Moves an anonymous user's sessions and files onto a signed-in account.
   *
   * Someone who hits the three-session wall and signs in must keep their work;
   * losing it at exactly the conversion moment is the worst possible time. The
   * extension calls this after login, authenticated as the new account, with
   * the anonymous token it still holds.
   */
  async migrateAnonymousAccount(
    targetUserId: string,
    anonymousToken: string,
  ): Promise<{ migratedSessions: number; migratedFiles: number }> {
    let payload: AuthUser;
    try {
      payload = this.jwtService.verify<AuthUser>(anonymousToken);
    } catch {
      throw new BadRequestException('Anonymous token is not valid');
    }

    if (payload.id === targetUserId) {
      throw new BadRequestException(
        'Anonymous token belongs to the signed-in account',
      );
    }

    const source = await this.usersService.findById(payload.id);
    if (!source) {
      throw new BadRequestException('Anonymous account no longer exists');
    }

    // Without this an attacker holding any valid token could drain another
    // person's account into their own.
    if (source.email) {
      throw new ForbiddenException('Only anonymous accounts can be migrated');
    }

    const target = await this.usersService.findById(targetUserId);
    if (!target?.email) {
      throw new ForbiddenException(
        'Sign in before migrating an anonymous session',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.chatSession.updateMany({
        where: { userId: source.id },
        data: { userId: targetUserId },
      });
      const files = await tx.file.updateMany({
        where: { userId: source.id },
        data: { userId: targetUserId },
      });

      await tx.user.delete({ where: { id: source.id } });

      return {
        migratedSessions: sessions.count,
        migratedFiles: files.count,
      };
    });
  }

  async validateUser(
    payload: AuthUser,
  ): Promise<Awaited<ReturnType<UsersService['findById']>>> {
    return this.usersService.findById(payload.id);
  }
}
