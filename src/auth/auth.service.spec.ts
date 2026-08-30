import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let prisma: { $transaction: jest.Mock };
  let tx: {
    chatSession: { updateMany: jest.Mock };
    file: { updateMany: jest.Mock };
    user: { delete: jest.Mock };
  };
  let users: { findByEmail: jest.Mock; create: jest.Mock; findById: jest.Mock };

  beforeEach(() => {
    jwt = {
      sign: jest.fn().mockReturnValue('signed.jwt.token'),
      verify: jest.fn().mockReturnValue({ id: 'anon1' }),
    };
    tx = {
      chatSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      file: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      user: { delete: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    users = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
    };
    service = new AuthService(
      jwt as unknown as JwtService,
      users as unknown as UsersService,
      prisma as unknown as PrismaService,
    );
  });

  describe('login', () => {
    it('reuses the existing account when the email is already known', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'nina@example.com',
        authProvider: 'google',
      });

      const result = await service.login({
        email: 'nina@example.com',
        provider: 'google',
      });

      expect(users.create).not.toHaveBeenCalled();
      expect(result.user.id).toBe('u1');
    });

    it('creates an account on first sign-in', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue({
        id: 'u2',
        email: 'kemi@example.com',
        authProvider: 'github',
      });

      const result = await service.login({
        email: 'kemi@example.com',
        provider: 'github',
      });

      expect(users.create).toHaveBeenCalledWith({
        email: 'kemi@example.com',
        authProvider: 'github',
      });
      expect(result.user.id).toBe('u2');
    });

    it('returns a signed token carrying the database id, not the provider id', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'nina@example.com',
        authProvider: 'google',
      });

      const result = await service.login({
        email: 'nina@example.com',
        provider: 'google',
        accessToken: 'provider-token',
      });

      expect(jwt.sign).toHaveBeenCalledWith({
        id: 'u1',
        email: 'nina@example.com',
        authProvider: 'google',
      });
      expect(result.access_token).toBe('signed.jwt.token');
    });

    it('never puts the provider access token in the payload', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'n@e.com',
        authProvider: 'google',
      });

      await service.login({
        email: 'n@e.com',
        provider: 'google',
        accessToken: 'secret-provider-token',
      });

      const [payload] = jwt.sign.mock.calls[0];
      expect(JSON.stringify(payload)).not.toContain('secret-provider-token');
    });
  });

  describe('createAnonymousUser', () => {
    it('creates a user with no email or provider', async () => {
      users.create.mockResolvedValue({ id: 'anon1' });

      await service.createAnonymousUser();

      expect(users.create).toHaveBeenCalledWith({
        authProvider: null,
        email: null,
      });
    });

    it('issues a token containing only the id', async () => {
      users.create.mockResolvedValue({ id: 'anon1' });

      const result = await service.createAnonymousUser();

      expect(jwt.sign).toHaveBeenCalledWith({ id: 'anon1' });
      expect(result.user).toEqual({ id: 'anon1' });
    });
  });

  describe('validateUser', () => {
    it('resolves the user named by the token payload', async () => {
      users.findById.mockResolvedValue({ id: 'u1' });

      await expect(service.validateUser({ id: 'u1' })).resolves.toEqual({
        id: 'u1',
      });
      expect(users.findById).toHaveBeenCalledWith('u1');
    });

    it('returns null when the account has since been deleted', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.validateUser({ id: 'gone' })).resolves.toBeNull();
    });
  });

  describe('migrateAnonymousAccount', () => {
    const anonymous = { id: 'anon1', email: null };
    const target = { id: 'user1', email: 'nina@example.com' };

    beforeEach(() => {
      users.findById.mockImplementation((id: string) =>
        Promise.resolve(id === 'anon1' ? anonymous : target),
      );
    });

    it('moves sessions and files onto the signed-in account', async () => {
      const result = await service.migrateAnonymousAccount('user1', 'tok');

      expect(tx.chatSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'anon1' },
        data: { userId: 'user1' },
      });
      expect(tx.file.updateMany).toHaveBeenCalledWith({
        where: { userId: 'anon1' },
        data: { userId: 'user1' },
      });
      expect(result).toEqual({ migratedSessions: 2, migratedFiles: 3 });
    });

    it('removes the anonymous account afterwards', async () => {
      await service.migrateAnonymousAccount('user1', 'tok');

      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'anon1' } });
    });

    it('does the whole move in one transaction', async () => {
      await service.migrateAnonymousAccount('user1', 'tok');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects a token that does not verify', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('bad signature');
      });

      await expect(
        service.migrateAnonymousAccount('user1', 'forged'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to migrate an account that is not anonymous', async () => {
      // Otherwise anyone holding a valid token could drain another person's
      // account into their own.
      users.findById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'anon1' ? { id: 'anon1', email: 'someone@else.com' } : target,
        ),
      );

      await expect(
        service.migrateAnonymousAccount('user1', 'tok'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.chatSession.updateMany).not.toHaveBeenCalled();
    });

    it('refuses when the destination is itself anonymous', async () => {
      users.findById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'anon1' ? anonymous : { id: 'user1', email: null },
        ),
      );

      await expect(
        service.migrateAnonymousAccount('user1', 'tok'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects migrating an account into itself', async () => {
      jwt.verify.mockReturnValue({ id: 'user1' });

      await expect(
        service.migrateAnonymousAccount('user1', 'tok'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a token naming an account that no longer exists', async () => {
      users.findById.mockImplementation((id: string) =>
        Promise.resolve(id === 'anon1' ? null : target),
      );

      await expect(
        service.migrateAnonymousAccount('user1', 'tok'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
