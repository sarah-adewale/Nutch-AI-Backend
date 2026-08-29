import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const build = (key: string) =>
    new EncryptionService({
      get: () => key,
    } as unknown as ConfigService);

  it('round-trips a value back to the original', () => {
    const service = build('test-encryption-key');
    const secret = 'sk-proj-abc123456789';

    expect(service.decrypt(service.encrypt(secret))).toBe(secret);
  });

  it('does not store the plaintext in the ciphertext', () => {
    const service = build('test-encryption-key');
    const secret = 'sk-proj-abc123456789';

    expect(service.encrypt(secret)).not.toContain(secret);
  });

  it('produces different ciphertext each time for the same input', () => {
    const service = build('test-encryption-key');

    // A random salt per call means identical keys are not detectably identical
    // in the database.
    expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
  });

  it('cannot decrypt a value encrypted under a different key', () => {
    const encrypted = build('key-one').encrypt('sk-secret');

    expect(build('key-two').decrypt(encrypted)).toBe('');
  });

  it('round-trips unicode intact', () => {
    const service = build('test-encryption-key');
    const value = 'clé-secrète-🔑';

    expect(service.decrypt(service.encrypt(value))).toBe(value);
  });
});
