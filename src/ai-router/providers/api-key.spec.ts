import { isUsableApiKey } from './api-key';

describe('isUsableApiKey', () => {
  it('accepts a real looking key', () => {
    expect(isUsableApiKey('sk-ant-api03-abcdef')).toBe(true);
    expect(isUsableApiKey('sk-proj-abcdef')).toBe(true);
  });

  it('rejects the placeholders shipped in .env.example', () => {
    expect(isUsableApiKey('your-openai-api-key')).toBe(false);
    expect(isUsableApiKey('your-anthropic-api-key')).toBe(false);
    expect(isUsableApiKey('YOUR-KEY')).toBe(false);
  });

  it('rejects unset, empty and whitespace-only values', () => {
    expect(isUsableApiKey(undefined)).toBe(false);
    expect(isUsableApiKey('')).toBe(false);
    expect(isUsableApiKey('   ')).toBe(false);
  });

  it('does not reject a key that merely contains "your" later on', () => {
    expect(isUsableApiKey('sk-your-team-key')).toBe(true);
  });
});
