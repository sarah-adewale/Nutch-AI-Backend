import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

const HEX_KEY = 'a'.repeat(64);

describe('EncryptionService', () => {
  const build = (key?: string) =>
    new EncryptionService({ get: () => key } as unknown as ConfigService);

  describe('isConfigured', () => {
    it('is false when unset or blank', () => {
      expect(build(undefined).isConfigured()).toBe(false);
      expect(build('   ').isConfigured()).toBe(false);
    });

    it('is false for the placeholder shipped in .env.example', () => {
      // Encrypting real user keys under a published placeholder would be
      // indistinguishable from storing them in the clear.
      expect(
        build('your-256-bit-encryption-key-for-byok-keys').isConfigured(),
      ).toBe(false);
    });

    it('is true for a real key', () => {
      expect(build(HEX_KEY).isConfigured()).toBe(true);
      expect(build('a long random passphrase').isConfigured()).toBe(true);
    });
  });

  describe('round trip', () => {
    it('returns the original value', () => {
      const service = build(HEX_KEY);
      const secret = 'sk-ant-api03-abcdefghijklmnop';

      expect(service.decrypt(service.encrypt(secret))).toBe(secret);
    });

    it('round-trips unicode intact', () => {
      const service = build(HEX_KEY);
      expect(service.decrypt(service.encrypt('clé-🔑'))).toBe('clé-🔑');
    });

    it('round-trips an empty string', () => {
      const service = build(HEX_KEY);
      expect(service.decrypt(service.encrypt(''))).toBe('');
    });

    it('works with a derived key as well as a raw hex key', () => {
      const service = build('a long random passphrase');
      expect(service.decrypt(service.encrypt('sk-test'))).toBe('sk-test');
    });
  });

  describe('ciphertext', () => {
    it('does not contain the plaintext', () => {
      const service = build(HEX_KEY);
      const secret = 'sk-ant-api03-abcdefghijklmnop';

      expect(service.encrypt(secret)).not.toContain(secret);
    });

    it('differs each time for the same input', () => {
      const service = build(HEX_KEY);

      // A random IV per record means identical keys are not detectably
      // identical in the database.
      expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
    });

    it('is stamped with a version for future rotation', () => {
      expect(build(HEX_KEY).encrypt('x').startsWith('v1.')).toBe(true);
    });

    it('has four dot-separated parts', () => {
      expect(build(HEX_KEY).encrypt('x').split('.')).toHaveLength(4);
    });
  });

  describe('tamper detection', () => {
    it('rejects a modified ciphertext instead of returning garbage', () => {
      const service = build(HEX_KEY);
      const [v, iv, tag, data] = service.encrypt('sk-secret').split('.');
      const flipped = Buffer.from(data, 'base64');
      flipped[0] ^= 0xff;

      expect(() =>
        service.decrypt([v, iv, tag, flipped.toString('base64')].join('.')),
      ).toThrow();
    });

    it('rejects a swapped authentication tag', () => {
      const service = build(HEX_KEY);
      const a = service.encrypt('sk-one').split('.');
      const b = service.encrypt('sk-two').split('.');

      expect(() =>
        service.decrypt([a[0], a[1], b[2], a[3]].join('.')),
      ).toThrow();
    });

    it('rejects an unknown format', () => {
      expect(() => build(HEX_KEY).decrypt('not-ciphertext')).toThrow(
        /Unrecognised ciphertext format/,
      );
    });

    it('rejects a version it does not know', () => {
      const service = build(HEX_KEY);
      const parts = service.encrypt('x').split('.');
      parts[0] = 'v9';

      expect(() => service.decrypt(parts.join('.'))).toThrow(
        /Unrecognised ciphertext format/,
      );
    });

    it('cannot decrypt a record written under a different key', () => {
      const encrypted = build(HEX_KEY).encrypt('sk-secret');

      expect(() => build('b'.repeat(64)).decrypt(encrypted)).toThrow();
    });
  });

  describe('unconfigured key', () => {
    it('refuses to encrypt rather than using a placeholder', () => {
      expect(() => build('your-placeholder').encrypt('sk-secret')).toThrow(
        ServiceUnavailableException,
      );
    });

    it('refuses to decrypt', () => {
      expect(() => build(undefined).decrypt('v1.a.b.c')).toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('matches', () => {
    it('compares equal strings', () => {
      expect(build(HEX_KEY).matches('abc', 'abc')).toBe(true);
    });

    it('rejects different strings and differing lengths', () => {
      const service = build(HEX_KEY);
      expect(service.matches('abc', 'abd')).toBe(false);
      expect(service.matches('abc', 'abcd')).toBe(false);
    });
  });
});
