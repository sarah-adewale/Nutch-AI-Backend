import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

/**
 * AES-256-GCM at rest for BYOK keys.
 *
 * The previous implementation used crypto-js `AES.encrypt(text, passphrase)`,
 * which derives its key with OpenSSL's legacy MD5 routine and runs CBC with no
 * authentication tag - ciphertext was malleable and nothing detected tampering.
 * GCM authenticates, so a modified record fails to decrypt instead of yielding
 * attacker-influenced plaintext.
 *
 * Stored form is `v1.<iv>.<tag>.<ciphertext>`, all base64. The version prefix
 * exists so a future key rotation can tell records apart.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard
const KEY_BYTES = 32;

/**
 * Fixed salt. The derivation must be deterministic to decrypt later, and the
 * input is a server-held secret rather than a user password, so a per-record
 * salt would buy nothing. Prefer configuring 64 hex characters, which skips
 * derivation entirely.
 */
const KDF_SALT = 'nutch-byok-v1';

@Injectable()
export class EncryptionService {
  private readonly rawKey: string | undefined;
  private cachedKey?: Buffer;

  constructor(private configService: ConfigService) {
    this.rawKey = this.configService.get<string>('ENCRYPTION_KEY');
  }

  /** False when the configured key is missing or still the shipped placeholder. */
  isConfigured(): boolean {
    const key = this.rawKey?.trim();
    if (!key) return false;
    return !/^your-/i.test(key);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key(), iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return [
      VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error('Unrecognised ciphertext format');
    }

    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    // Throws if the tag does not verify, i.e. the record was altered.
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Constant-time compare, for checking a value without leaking via timing. */
  matches(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  private key(): Buffer {
    if (this.cachedKey) return this.cachedKey;

    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'ENCRYPTION_KEY is not configured, so API keys cannot be stored securely.',
      );
    }

    const configured = this.rawKey.trim();

    this.cachedKey = /^[0-9a-f]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : scryptSync(configured, KDF_SALT, KEY_BYTES);

    return this.cachedKey;
  }
}
