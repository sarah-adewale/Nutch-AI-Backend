/**
 * The API returns a machine-readable `error` field alongside the status so the
 * UI can respond specifically rather than showing one generic failure. These
 * mirror the codes the backend raises.
 */

export type ApiErrorCode =
  | 'LIMIT_REACHED'
  | 'DAILY_QUOTA_REACHED'
  | 'PROVIDER_ERROR'
  | 'UNKNOWN';

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  /** LIMIT_REACHED */
  resource?: 'chat_sessions' | 'files';
  limit?: number;
  current?: number;
  action?: 'sign_in' | 'connect_byok';
  /** DAILY_QUOTA_REACHED */
  resets_at?: string;
  /** PROVIDER_ERROR */
  provider?: string;
  failure?:
    | 'quota_exhausted'
    | 'auth_failed'
    | 'rate_limited'
    | 'bad_request'
    | 'unavailable';
  detail?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    // ValidationPipe returns an array of messages; join so `message` is always
    // something that can be rendered.
    const text = Array.isArray(body.message)
      ? body.message.join(', ')
      : (body.message ?? 'Request failed');
    super(text);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.code = normaliseCode(body.error);
  }

  /** True when signing in is what unblocks the user. */
  get needsSignIn(): boolean {
    return this.code === 'LIMIT_REACHED' || this.body.action === 'sign_in';
  }

  /** True when connecting an API key is what unblocks the user. */
  get needsOwnKey(): boolean {
    return (
      this.code === 'DAILY_QUOTA_REACHED' ||
      (this.code === 'PROVIDER_ERROR' && this.body.failure === 'quota_exhausted')
    );
  }

  /** Whether retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    if (this.code === 'PROVIDER_ERROR') {
      return this.body.failure === 'rate_limited' || this.body.failure === 'unavailable';
    }
    return this.status >= 500;
  }
}

function normaliseCode(error: string | undefined): ApiErrorCode {
  switch (error) {
    case 'LIMIT_REACHED':
    case 'DAILY_QUOTA_REACHED':
    case 'PROVIDER_ERROR':
      return error;
    default:
      return 'UNKNOWN';
  }
}
