import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

  async validateUser(
    payload: AuthUser,
  ): Promise<Awaited<ReturnType<UsersService['findById']>>> {
    return this.usersService.findById(payload.id);
  }
}
