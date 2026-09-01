import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MagicLinkService } from './magic-link.service';
import { MailerService } from './mailer.service';

describe('MagicLinkService', () => {
  let service: MagicLinkService;
  let mailer: { send: jest.Mock };

  const build = (values: Record<string, unknown> = {}) => {
    mailer = { send: jest.fn().mockResolvedValue(undefined) };
    return new MagicLinkService(
      { get: (k: string) => values[k] } as unknown as ConfigService,
      mailer as unknown as MailerService,
    );
  };

  const tokenFrom = () => {
    const { link } = mailer.send.mock.calls[0][0];
    return new URL(link).searchParams.get('token')!;
  };

  beforeEach(() => {
    service = build({ FRONTEND_URL: 'https://app.example.com' });
  });

  describe('request', () => {
    it('emails a link containing a token', async () => {
      await service.request('nina@example.com');

      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(tokenFrom().length).toBeGreaterThan(20);
    });

    it('normalises the address', async () => {
      await service.request('  Nina@Example.COM  ');

      expect(mailer.send.mock.calls[0][0].to).toBe('nina@example.com');
    });

    it('issues a different token each time', async () => {
      await service.request('a@b.com');
      const first = tokenFrom();
      mailer.send.mockClear();
      await service.request('a@b.com');

      expect(tokenFrom()).not.toBe(first);
    });

    it('uses the configured link expiry', async () => {
      service = build({ MAGIC_LINK_TTL_MINUTES: 5 });
      await service.request('a@b.com');

      expect(mailer.send.mock.calls[0][0].expiresInMinutes).toBe(5);
    });

    it('falls back to a sane expiry when misconfigured', async () => {
      service = build({ MAGIC_LINK_TTL_MINUTES: 'soon' });
      await service.request('a@b.com');

      expect(mailer.send.mock.calls[0][0].expiresInMinutes).toBe(15);
    });
  });

  describe('consume', () => {
    it('returns the address the token belongs to', async () => {
      await service.request('nina@example.com');

      expect(service.consume(tokenFrom())).toBe('nina@example.com');
    });

    it('rejects a token that was already used', async () => {
      await service.request('nina@example.com');
      const token = tokenFrom();
      service.consume(token);

      expect(() => service.consume(token)).toThrow(BadRequestException);
    });

    it('rejects an expired token', async () => {
      const start = 1_000_000;
      await service.request('nina@example.com', start);

      expect(() => service.consume(tokenFrom(), start + 16 * 60_000)).toThrow(
        BadRequestException,
      );
    });

    it('accepts a token just inside its window', async () => {
      const start = 1_000_000;
      await service.request('nina@example.com', start);

      expect(service.consume(tokenFrom(), start + 14 * 60_000)).toBe(
        'nina@example.com',
      );
    });

    it('rejects an unknown token', () => {
      expect(() => service.consume('not-a-real-token')).toThrow(
        BadRequestException,
      );
    });

    it('gives the same message for expired and unknown tokens', async () => {
      // Distinguishing them would tell an attacker which guesses were once
      // valid.
      const start = 1_000_000;
      await service.request('a@b.com', start);

      const expired = (() => {
        try {
          service.consume(tokenFrom(), start + 16 * 60_000);
        } catch (e) {
          return (e as Error).message;
        }
      })();
      const unknown = (() => {
        try {
          service.consume('nope');
        } catch (e) {
          return (e as Error).message;
        }
      })();

      expect(expired).toBe(unknown);
    });
  });

  describe('storage', () => {
    it('never retains the raw token', async () => {
      await service.request('nina@example.com');
      const token = tokenFrom();

      // A leaked store must not yield a working link.
      expect(
        JSON.stringify([
          ...(service as never as { tokens: Map<string, unknown> }).tokens,
        ]),
      ).not.toContain(token);
    });

    it('prunes used and expired tokens', async () => {
      const start = 1_000_000;
      await service.request('a@b.com', start);
      await service.request('b@b.com', start);

      expect(service.prune(start + 16 * 60_000)).toBe(2);
      expect(service.prune(start + 16 * 60_000)).toBe(0);
    });

    it('keeps a token that is still valid and unused', async () => {
      await service.request('a@b.com', 1_000_000);

      expect(service.prune(1_000_001)).toBe(0);
    });
  });
});
