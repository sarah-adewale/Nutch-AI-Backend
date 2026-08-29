import { ForbiddenException } from '@nestjs/common';

/**
 * Origin matching for the browser extension.
 *
 * The extension calls the API from `chrome-extension://<id>`, which is a fixed
 * origin per installed build but differs between the unpacked dev build and the
 * published one. Patterns therefore support a `*` wildcard, matched against a
 * single path-free segment so `chrome-extension://*` cannot also match
 * `chrome-extension://evil/../x`.
 */

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '[^/]*')}$`);
}

export function isOriginAllowed(
  origin: string | undefined,
  patterns: string[],
): boolean {
  // Same-origin and non-browser callers (curl, health probes, server-to-server)
  // send no Origin header at all.
  if (!origin) return true;
  return patterns.some((pattern) => patternToRegExp(pattern).test(origin));
}

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

type OriginCallback = (err: Error | null, allow?: boolean) => void;

export function createCorsOriginHandler(patterns: string[]) {
  return (origin: string | undefined, callback: OriginCallback) => {
    if (isOriginAllowed(origin, patterns)) {
      callback(null, true);
      return;
    }
    // A ForbiddenException so the global filter renders 403 rather than
    // treating a rejected origin as an unexpected server fault.
    callback(new ForbiddenException(`Origin ${origin} is not permitted`));
  };
}
