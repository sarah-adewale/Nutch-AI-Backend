import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { UNLIMITED } from './limits.service';

export interface UsageWindow {
  count: number;
  resetAt: number;
}

export class DailyQuotaExceededException extends HttpException {
  constructor(limit: number, resetAt: number) {
    super(
      {
        error: 'DAILY_QUOTA_REACHED',
        message: `You have used all ${limit} prompts on the shared Nutch key today. Connect your own API key to continue.`,
        limit,
        resets_at: new Date(resetAt).toISOString(),
        action: 'connect_byok',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A daily ceiling on prompts served with the Nutch key.
 *
 * The global throttler protects the server from bursts; it does nothing about
 * one account quietly spending real money all day. Requests on a user's own
 * key are not counted - they are not our cost, and capping them would make
 * BYOK worse than not connecting a key.
 *
 * Counters live in memory. That is honest for a single instance and resets on
 * deploy; Redis is the obvious next step once there is more than one process.
 */
@Injectable()
export class UsageService {
  private readonly windows = new Map<string, UsageWindow>();

  constructor(private config: ConfigService) {}

  /** `-1` disables the ceiling, matching the convention used for storage limits. */
  private limitFor(isAnonymous: boolean): number {
    const key = isAnonymous
      ? 'DAILY_PROMPTS_ANONYMOUS'
      : 'DAILY_PROMPTS_SIGNED_IN';
    const parsed = Number(this.config.get(key));
    if (Number.isFinite(parsed) && (parsed >= 0 || parsed === UNLIMITED)) {
      return parsed;
    }
    return isAnonymous ? 20 : 200;
  }

  peek(userId: string, isAnonymous: boolean, now = Date.now()) {
    const limit = this.limitFor(isAnonymous);
    if (limit === UNLIMITED) {
      return { limit, used: 0, remaining: UNLIMITED, resetAt: now + DAY_MS };
    }
    const window = this.windows.get(userId);
    const active = window && window.resetAt > now;

    return {
      limit,
      used: active ? window.count : 0,
      remaining: active ? Math.max(limit - window.count, 0) : limit,
      resetAt: active ? window.resetAt : now + DAY_MS,
    };
  }

  /** Counts one prompt against the shared key, or throws once the day is spent. */
  consume(userId: string, isAnonymous: boolean, now = Date.now()): void {
    const limit = this.limitFor(isAnonymous);
    if (limit === UNLIMITED) return;
    const existing = this.windows.get(userId);
    const window =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + DAY_MS };

    if (window.count >= limit) {
      this.windows.set(userId, window);
      throw new DailyQuotaExceededException(limit, window.resetAt);
    }

    window.count += 1;
    this.windows.set(userId, window);
  }

  /** Drops expired windows so the map does not grow without bound. */
  prune(now = Date.now()): number {
    let removed = 0;
    for (const [userId, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(userId);
        removed += 1;
      }
    }
    return removed;
  }
}
