import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PrismaClient } from '@prisma/client';

type User = NonNullable<
  Awaited<ReturnType<PrismaClient['user']['findUnique']>>
>;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    email?: string | null;
    authProvider?: string | null;
    subscriptionTier?: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    if (!email) return null;
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(
    id: string,
    data: {
      email?: string | null;
      authProvider?: string | null;
      subscriptionTier?: string;
      updatedAt?: Date;
    },
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async isAnonymous(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    return !user?.email;
  }

  async getUserChatSessionCount(userId: string): Promise<number> {
    return this.prisma.chatSession.count({
      where: { userId },
    });
  }

  async getUserFileCount(userId: string): Promise<number> {
    return this.prisma.file.count({
      where: { userId },
    });
  }
}
