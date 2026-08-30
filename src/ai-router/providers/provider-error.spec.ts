import { HttpStatus } from '@nestjs/common';
import {
  ProviderException,
  classifyProviderError,
  safeDetail,
} from './provider-error';

const sdkError = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

describe('classifyProviderError', () => {
  it('reads an unfunded Anthropic account from a 400', () => {
    // Anthropic reports this as a 400, which would otherwise look like a
    // malformed request.
    expect(
      classifyProviderError(
        sdkError(
          400,
          '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
        ),
      ),
    ).toBe('quota_exhausted');
  });

  it('reads an unfunded OpenAI account from a 429', () => {
    expect(
      classifyProviderError(
        sdkError(429, 'You exceeded your current quota (insufficient_quota)'),
      ),
    ).toBe('quota_exhausted');
  });

  it('separates a genuine rate limit from a quota problem', () => {
    expect(classifyProviderError(sdkError(429, 'Rate limit exceeded'))).toBe(
      'rate_limited',
    );
  });

  it.each([401, 403])('treats %s as an auth failure', (status) => {
    expect(classifyProviderError(sdkError(status, 'invalid x-api-key'))).toBe(
      'auth_failed',
    );
  });

  it.each([500, 503, 529])('treats %s as unavailable', (status) => {
    expect(classifyProviderError(sdkError(status, 'overloaded'))).toBe(
      'unavailable',
    );
  });

  it('treats another 400 as a bad request', () => {
    expect(classifyProviderError(sdkError(400, 'max_tokens too large'))).toBe(
      'bad_request',
    );
  });

  it('treats a network error with no status as unavailable', () => {
    expect(classifyProviderError(new Error('ECONNRESET'))).toBe('unavailable');
  });

  it('does not throw on a non-error value', () => {
    expect(classifyProviderError('kaboom')).toBe('unavailable');
    expect(classifyProviderError(null)).toBe('unavailable');
  });
});

describe('safeDetail', () => {
  it('extracts the provider message from a JSON error body', () => {
    const detail = safeDetail(
      sdkError(400, '400 {"error":{"message":"max_tokens: must be <= 8192"}}'),
      'bad_request',
    );

    expect(detail).toBe('max_tokens: must be <= 8192');
  });

  it('says nothing for an auth failure, which could hint at our key', () => {
    expect(
      safeDetail(sdkError(401, 'invalid x-api-key sk-ant-123'), 'auth_failed'),
    ).toBeUndefined();
  });

  it('says nothing for an outage', () => {
    expect(
      safeDetail(sdkError(503, 'overloaded'), 'unavailable'),
    ).toBeUndefined();
  });

  it('caps the length of what it passes through', () => {
    const detail = safeDetail(sdkError(400, 'x'.repeat(1000)), 'bad_request');
    expect(detail!.length).toBe(300);
  });
});

describe('ProviderException', () => {
  it('maps an exhausted quota to 402 with an actionable message', () => {
    const err = new ProviderException('anthropic', 'quota_exhausted');

    expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(err.getResponse()).toEqual({
      error: 'PROVIDER_ERROR',
      message: expect.stringContaining('no remaining credit'),
      provider: 'anthropic',
      failure: 'quota_exhausted',
    });
  });

  it('maps our own bad credentials to 502, not 401', () => {
    // A 401 would suggest the caller's token is wrong; it is ours.
    expect(new ProviderException('openai', 'auth_failed').getStatus()).toBe(
      HttpStatus.BAD_GATEWAY,
    );
  });

  it('passes a rate limit through as 429', () => {
    expect(new ProviderException('anthropic', 'rate_limited').getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('includes detail only when supplied', () => {
    const withDetail = new ProviderException(
      'anthropic',
      'bad_request',
      'oops',
    );
    expect(withDetail.getResponse()).toMatchObject({ detail: 'oops' });
  });
});
