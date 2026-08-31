import { describe, expect, it } from 'vitest';
import { ApiError } from './errors';

describe('ApiError', () => {
  it('joins the array of messages ValidationPipe returns', () => {
    const error = new ApiError(400, {
      statusCode: 400,
      message: ['model must be a string', 'prompt is required'],
    });

    expect(error.message).toBe('model must be a string, prompt is required');
  });

  it('falls back when the body carries no message', () => {
    expect(
      new ApiError(500, { statusCode: 500 } as never).message,
    ).toBe('Request failed');
  });

  describe('storage limit', () => {
    const error = new ApiError(403, {
      statusCode: 403,
      error: 'LIMIT_REACHED',
      message: 'Anonymous sessions are limited to 3 chat sessions.',
      resource: 'chat_sessions',
      limit: 3,
      current: 3,
      action: 'sign_in',
    });

    it('is recognised and asks for sign-in', () => {
      expect(error.code).toBe('LIMIT_REACHED');
      expect(error.needsSignIn).toBe(true);
      expect(error.needsOwnKey).toBe(false);
    });

    it('carries the numbers the nudge needs', () => {
      expect(error.body.limit).toBe(3);
      expect(error.body.current).toBe(3);
    });
  });

  describe('daily quota', () => {
    const error = new ApiError(429, {
      statusCode: 429,
      error: 'DAILY_QUOTA_REACHED',
      message: 'You have used all 20 prompts today.',
      resets_at: '2026-09-01T00:00:00.000Z',
      action: 'connect_byok',
    });

    it('asks for a key rather than a sign-in', () => {
      expect(error.needsOwnKey).toBe(true);
      expect(error.needsSignIn).toBe(false);
    });

    it('is not retryable, since waiting is the only remedy', () => {
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('provider failures', () => {
    const provider = (failure: string, status: number) =>
      new ApiError(status, {
        statusCode: status,
        error: 'PROVIDER_ERROR',
        message: 'upstream',
        provider: 'anthropic',
        failure: failure as never,
      });

    it('treats an exhausted balance as needing a key', () => {
      expect(provider('quota_exhausted', 402).needsOwnKey).toBe(true);
    });

    it('treats a rate limit as retryable but not a key problem', () => {
      const error = provider('rate_limited', 429);
      expect(error.isRetryable).toBe(true);
      expect(error.needsOwnKey).toBe(false);
    });

    it('treats an outage as retryable', () => {
      expect(provider('unavailable', 502).isRetryable).toBe(true);
    });

    it('does not offer a retry for a rejected request', () => {
      expect(provider('bad_request', 400).isRetryable).toBe(false);
    });
  });

  it('falls back to UNKNOWN for an unrecognised code', () => {
    const error = new ApiError(418, {
      statusCode: 418,
      error: 'SOMETHING_NEW',
      message: 'x',
    });

    expect(error.code).toBe('UNKNOWN');
    expect(error.needsSignIn).toBe(false);
  });

  it('treats a 5xx with no code as retryable', () => {
    expect(new ApiError(503, { statusCode: 503, message: 'x' }).isRetryable).toBe(true);
  });
});
