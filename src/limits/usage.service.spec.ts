import { ConfigService } from '@nestjs/config';
import { DailyQuotaExceededException, UsageService } from './usage.service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('UsageService', () => {
  const build = (values: Record<string, unknown> = {}) =>
    new UsageService({
      get: (key: string) => values[key],
    } as unknown as ConfigService);

  it('defaults to 20 prompts for anonymous and 200 for signed-in', () => {
    const service = build();

    expect(service.peek('u1', true).limit).toBe(20);
    expect(service.peek('u1', false).limit).toBe(200);
  });

  it('honours configured limits, coercing strings from the environment', () => {
    const service = build({
      DAILY_PROMPTS_ANONYMOUS: '5',
      DAILY_PROMPTS_SIGNED_IN: '50',
    });

    expect(service.peek('u1', true).limit).toBe(5);
    expect(service.peek('u1', false).limit).toBe(50);
  });

  it('counts each prompt against the window', () => {
    const service = build({ DAILY_PROMPTS_ANONYMOUS: 3 });

    service.consume('u1', true);
    service.consume('u1', true);

    expect(service.peek('u1', true)).toMatchObject({ used: 2, remaining: 1 });
  });

  it('throws once the day is spent', () => {
    const service = build({ DAILY_PROMPTS_ANONYMOUS: 2 });

    service.consume('u1', true);
    service.consume('u1', true);

    expect(() => service.consume('u1', true)).toThrow(
      DailyQuotaExceededException,
    );
  });

  it('reports 429 with a reset time and a BYOK call to action', () => {
    const service = build({ DAILY_PROMPTS_ANONYMOUS: 1 });
    service.consume('u1', true);

    try {
      service.consume('u1', true);
      throw new Error('expected a rejection');
    } catch (error) {
      const err = error as DailyQuotaExceededException;
      expect(err.getStatus()).toBe(429);
      expect(err.getResponse()).toMatchObject({
        error: 'DAILY_QUOTA_REACHED',
        limit: 1,
        action: 'connect_byok',
      });
    }
  });

  it('keeps users separate', () => {
    const service = build({ DAILY_PROMPTS_ANONYMOUS: 1 });

    service.consume('u1', true);

    expect(() => service.consume('u2', true)).not.toThrow();
  });

  it('starts a fresh window once the day rolls over', () => {
    const service = build({ DAILY_PROMPTS_ANONYMOUS: 1 });
    const start = 1_000_000;

    service.consume('u1', true, start);
    expect(() => service.consume('u1', true, start + 1000)).toThrow();

    expect(() => service.consume('u1', true, start + DAY_MS + 1)).not.toThrow();
  });

  it('reports a full allowance again after the window expires', () => {
    const service = build({ DAILY_PROMPTS_ANONYMOUS: 5 });
    const start = 1_000_000;

    service.consume('u1', true, start);

    expect(service.peek('u1', true, start + DAY_MS + 1)).toMatchObject({
      used: 0,
      remaining: 5,
    });
  });

  it('treats a limit of zero as no prompts allowed', () => {
    const service = build({ DAILY_PROMPTS_ANONYMOUS: 0 });

    expect(() => service.consume('u1', true)).toThrow(
      DailyQuotaExceededException,
    );
  });

  it('treats -1 as unlimited, matching the storage-limit convention', () => {
    const service = build({ DAILY_PROMPTS_SIGNED_IN: -1 });

    for (let i = 0; i < 500; i++) {
      expect(() => service.consume('u1', false)).not.toThrow();
    }
    expect(service.peek('u1', false).remaining).toBe(-1);
  });

  it('falls back to the default for a non-numeric limit', () => {
    const service = build({ DAILY_PROMPTS_ANONYMOUS: 'lots' });

    expect(service.peek('u1', true).limit).toBe(20);
  });

  describe('prune', () => {
    it('drops expired windows so the map does not grow without bound', () => {
      const service = build();
      const start = 1_000_000;

      service.consume('u1', true, start);
      service.consume('u2', true, start);

      expect(service.prune(start + DAY_MS + 1)).toBe(2);
      expect(service.prune(start + DAY_MS + 1)).toBe(0);
    });

    it('keeps windows that are still active', () => {
      const service = build();
      service.consume('u1', true, 1_000_000);

      expect(service.prune(1_000_001)).toBe(0);
    });
  });
});
