import { fatalIssues, validateConfig } from './config-validation';

const base = {
  DATABASE_URL: 'postgresql://localhost:5432/nutch',
  JWT_SECRET: 'a'.repeat(40),
  ENCRYPTION_KEY: 'b'.repeat(64),
};

describe('validateConfig', () => {
  it('passes a well-formed configuration', () => {
    expect(validateConfig(base)).toEqual([]);
  });

  it.each(['DATABASE_URL', 'JWT_SECRET'])('reports missing %s', (key) => {
    const issues = validateConfig({ ...base, [key]: undefined });
    expect(issues).toContainEqual({ key, problem: 'is required but not set' });
  });

  it('treats whitespace as missing', () => {
    expect(validateConfig({ ...base, JWT_SECRET: '   ' })).toContainEqual({
      key: 'JWT_SECRET',
      problem: 'is required but not set',
    });
  });

  it('flags a placeholder secret', () => {
    const issues = validateConfig({
      ...base,
      JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
    });

    expect(issues[0].key).toBe('JWT_SECRET');
    expect(issues[0].problem).toMatch(/placeholder/);
  });

  it('requires a minimum secret length in production', () => {
    const issues = validateConfig({
      ...base,
      NODE_ENV: 'production',
      JWT_SECRET: 'short',
    });

    expect(issues).toContainEqual({
      key: 'JWT_SECRET',
      problem: 'must be at least 32 characters in production',
    });
  });

  it('does not enforce secret length outside production', () => {
    expect(validateConfig({ ...base, JWT_SECRET: 'short' })).toEqual([]);
  });
});

describe('fatalIssues', () => {
  it('stops a production boot on a placeholder secret', () => {
    const issues = fatalIssues({
      ...base,
      NODE_ENV: 'production',
      JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
    });

    expect(issues).toHaveLength(1);
  });

  it('lets a placeholder through in development', () => {
    // Local work should not be blocked; the services needing a real value
    // refuse on their own.
    expect(
      fatalIssues({
        ...base,
        ENCRYPTION_KEY: 'your-256-bit-encryption-key-for-byok-keys',
      }),
    ).toEqual([]);
  });

  it('still stops on a missing requirement in development', () => {
    expect(fatalIssues({ ...base, DATABASE_URL: undefined })).toHaveLength(1);
  });
});
