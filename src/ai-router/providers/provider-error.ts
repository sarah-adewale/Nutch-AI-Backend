import { HttpException, HttpStatus } from '@nestjs/common';
import { ProviderName } from './ai-provider.interface';

export type ProviderFailure =
  | 'quota_exhausted'
  | 'auth_failed'
  | 'rate_limited'
  | 'bad_request'
  | 'unavailable';

const STATUS: Record<ProviderFailure, number> = {
  // The account behind the key has no funds. Distinct from our own rate limit,
  // and actionable: top up, or connect your own key.
  quota_exhausted: HttpStatus.PAYMENT_REQUIRED,
  // Our key is wrong. Nothing the caller can do, so it reads as a gateway fault.
  auth_failed: HttpStatus.BAD_GATEWAY,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  bad_request: HttpStatus.BAD_REQUEST,
  unavailable: HttpStatus.BAD_GATEWAY,
};

const MESSAGE: Record<ProviderFailure, string> = {
  quota_exhausted:
    'The account behind this model has no remaining credit. Connect your own API key or top up the balance.',
  auth_failed: 'The upstream provider rejected our credentials.',
  rate_limited:
    'The upstream provider is rate limiting requests. Try again shortly.',
  bad_request: 'The upstream provider rejected the request.',
  unavailable: 'The upstream provider is unavailable. Try again shortly.',
};

export class ProviderException extends HttpException {
  constructor(
    provider: ProviderName,
    failure: ProviderFailure,
    detail?: string,
  ) {
    super(
      {
        error: 'PROVIDER_ERROR',
        message: MESSAGE[failure],
        provider,
        failure,
        ...(detail ? { detail } : {}),
      },
      STATUS[failure],
    );
  }
}

interface SdkError {
  status?: number;
  message?: string;
}

function asSdkError(error: unknown): SdkError | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as SdkError;
  if (typeof candidate.status !== 'number') return undefined;
  return candidate;
}

const QUOTA_PATTERNS =
  /credit balance is too low|insufficient_quota|exceeded your current quota|billing/i;

export function classifyProviderError(error: unknown): ProviderFailure {
  const sdk = asSdkError(error);
  if (!sdk) return 'unavailable';

  const message = sdk.message ?? '';

  // Anthropic reports an unfunded account as a 400; OpenAI as a 429. Both are
  // a billing problem rather than a malformed request or our own throttling.
  if (QUOTA_PATTERNS.test(message)) return 'quota_exhausted';

  if (sdk.status === 401 || sdk.status === 403) return 'auth_failed';
  if (sdk.status === 429) return 'rate_limited';
  if (sdk.status >= 500) return 'unavailable';
  if (sdk.status >= 400) return 'bad_request';

  return 'unavailable';
}

/** Strips anything that could carry a key or internal detail. */
export function safeDetail(
  error: unknown,
  failure: ProviderFailure,
): string | undefined {
  if (failure !== 'bad_request' && failure !== 'quota_exhausted')
    return undefined;
  const sdk = asSdkError(error);
  if (!sdk?.message) return undefined;

  const match = /"message"\s*:\s*"([^"]+)"/.exec(sdk.message);
  return (match?.[1] ?? sdk.message).slice(0, 300);
}
