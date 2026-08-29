import { ForbiddenException } from '@nestjs/common';
import {
  createCorsOriginHandler,
  isOriginAllowed,
  parseCorsOrigins,
} from './cors';

describe('parseCorsOrigins', () => {
  it('splits a comma separated list and trims whitespace', () => {
    expect(parseCorsOrigins('http://a.com, http://b.com')).toEqual([
      'http://a.com',
      'http://b.com',
    ]);
  });

  it('drops empty entries left by trailing commas', () => {
    expect(parseCorsOrigins('http://a.com,,')).toEqual(['http://a.com']);
  });

  it('returns an empty list when unset', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('')).toEqual([]);
  });
});

describe('isOriginAllowed', () => {
  const patterns = ['http://localhost:3000', 'chrome-extension://*'];

  it('allows an exact match', () => {
    expect(isOriginAllowed('http://localhost:3000', patterns)).toBe(true);
  });

  it('allows any extension id via the wildcard', () => {
    expect(
      isOriginAllowed('chrome-extension://abcdefghijklmnop', patterns),
    ).toBe(true);
  });

  it('rejects an origin that is not listed', () => {
    expect(isOriginAllowed('https://evil.com', patterns)).toBe(false);
  });

  it('rejects a scheme mismatch on an otherwise matching host', () => {
    expect(isOriginAllowed('https://localhost:3000', patterns)).toBe(false);
  });

  it('does not let the wildcard span a path separator', () => {
    expect(isOriginAllowed('chrome-extension://a/../b', patterns)).toBe(false);
  });

  it('does not treat regex characters in a pattern as syntax', () => {
    expect(isOriginAllowed('http://axb.com', ['http://a.b.com'])).toBe(false);
    expect(isOriginAllowed('http://a.b.com', ['http://a.b.com'])).toBe(true);
  });

  it('allows requests that carry no Origin header', () => {
    // curl, uptime probes and same-origin requests send no Origin.
    expect(isOriginAllowed(undefined, patterns)).toBe(true);
  });

  it('rejects every browser origin when no patterns are configured', () => {
    expect(isOriginAllowed('http://localhost:3000', [])).toBe(false);
  });
});

describe('createCorsOriginHandler', () => {
  it('calls back with true for a permitted origin', () => {
    const handler = createCorsOriginHandler(['http://localhost:3000']);
    const callback = jest.fn();
    handler('http://localhost:3000', callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('calls back with a 403 for a rejected origin', () => {
    const handler = createCorsOriginHandler(['http://localhost:3000']);
    const callback = jest.fn();
    handler('https://evil.com', callback);

    expect(callback).toHaveBeenCalledWith(expect.any(ForbiddenException));
    const [err] = callback.mock.calls[0];
    expect(err.getStatus()).toBe(403);
  });
});
