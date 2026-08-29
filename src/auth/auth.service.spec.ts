import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwt: { sign: jest.Mock };
  let users: { findByEmail: jest.Mock; create: jest.Mock; findById: jest.Mock };

  beforeEach(() => {
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    users = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
    };
    service = new AuthService(
      jwt as unknown as JwtService,
      users as unknown as UsersService,
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
});
