import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { MailerService } from './mailer.service';

interface StoredToken {
  email: string;
  /** SHA-256 of the token, so a leaked store cannot be replayed. */
  hash: string;
  expiresAt: number;
  used: boolean;
}

const TOKEN_BYTES = 32;
const DEFAULT_TTL_MINUTES = 15;

/**
 * Passwordless sign-in by emailed link.
 *
 * Tokens are single use and time limited, and only their hash is retained:
 * anyone reading the store cannot mint a working link. Held in memory for now,
 * consistent with the daily-usage counters; both want Redis before there is
 * more than one instance.
 */
@Injectable()
export class MagicLinkService {
  private readonly tokens = new Map<string, StoredToken>();

  constructor(
    private config: ConfigService,
    private mailer: MailerService,
  ) {}

  private get ttlMinutes(): number {
    const parsed = Number(this.config.get('MAGIC_LINK_TTL_MINUTES'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MINUTES;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async request(email: string, now = Date.now()): Promise<void> {
    const normalised = email.trim().toLowerCase();
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const ttl = this.ttlMinutes;

    this.tokens.set(this.hash(token), {
      email: normalised,
      hash: this.hash(token),
      expiresAt: now + ttl * 60_000,
      used: false,
    });

    const base =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3100';

    await this.mailer.send({
      to: normalised,
      link: `${base}/auth/magic?token=${token}`,
      expiresInMinutes: ttl,
    });
  }

  /** Returns the email a valid token belongs to, and burns the token. */
  consume(token: string, now = Date.now()): string {
    const record = this.tokens.get(this.hash(token));

    // Deliberately one message for every failure: distinguishing "expired"
    // from "unknown" tells an attacker which guesses were once valid.
    if (!record || record.used || record.expiresAt <= now) {
      throw new BadRequestException('That sign-in link is invalid or expired.');
    }

    const provided = Buffer.from(this.hash(token), 'hex');
    const stored = Buffer.from(record.hash, 'hex');
    if (
      provided.length !== stored.length ||
      !timingSafeEqual(provided, stored)
    ) {
      throw new BadRequestException('That sign-in link is invalid or expired.');
    }

    record.used = true;
    return record.email;
  }

  /** Drops spent and expired tokens so the map does not grow without bound. */
  prune(now = Date.now()): number {
    let removed = 0;
    for (const [key, record] of this.tokens) {
      if (record.used || record.expiresAt <= now) {
        this.tokens.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
