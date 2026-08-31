import { ApiError, ApiErrorBody } from './errors';
import { SseParser } from './sse';

export const DEFAULT_BASE_URL = 'http://localhost:3100/api/v1';

export interface ModelSummary {
  id: string;
  label: string;
  provider: 'anthropic' | 'openai';
  capabilities: { streaming: boolean; vision: boolean; imageGeneration: boolean };
  source: 'nutch' | 'user';
  available: boolean;
  locked: boolean;
}

export interface PromptRequest {
  model: string;
  input_type: 'text' | 'code' | 'image';
  prompt: string;
  context?: string;
  image_url?: string;
  session_id?: string;
}

export interface RedirectAnswer {
  redirect: true;
  tool: string;
  url: string;
  reason: string;
  pre_fill: string;
}

export interface PromptAnswer {
  response: string;
  model_used: string;
  timestamp: string;
  session_id: string;
  key_source: 'nutch' | 'user';
  files: Array<{ id: string; filename: string; folder: string; fileType: string }>;
  storage_limit_reached: boolean;
}

export type PromptResult = RedirectAnswer | PromptAnswer;

export function isRedirect(result: PromptResult): result is RedirectAnswer {
  return 'redirect' in result;
}

/** Events surfaced by the streaming endpoint, already decoded. */
export type StreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'delta'; text: string }
  | { type: 'redirect'; redirect: RedirectAnswer }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface ClientOptions {
  baseUrl?: string;
  /** Resolved per request, because the token changes when the user signs in. */
  getToken: () => Promise<string | undefined>;
  onUnauthorized?: () => void | Promise<void>;
}

export class NutchClient {
  private readonly baseUrl: string;

  constructor(private options: ClientOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  // --- auth ---------------------------------------------------------------

  createAnonymousSession() {
    return this.request<{ access_token: string; user: { id: string } }>(
      'POST',
      '/auth/anonymous',
      { auth: false },
    );
  }

  requestMagicLink(email: string) {
    return this.request<{ message: string }>('POST', '/auth/magic-link', {
      auth: false,
      body: { email },
    });
  }

  verifyMagicLink(token: string) {
    return this.request<{
      access_token: string;
      user: { id: string; email?: string };
    }>('POST', '/auth/magic-link/verify', { auth: false, body: { token } });
  }

  migrateAnonymous(anonymousToken: string) {
    return this.request<{ migratedSessions: number; migratedFiles: number }>(
      'POST',
      '/auth/migrate-anonymous',
      { body: { anonymous_token: anonymousToken } },
    );
  }

  // --- core ---------------------------------------------------------------

  getProfile() {
    return this.request<{
      id: string;
      email: string | null;
      isAnonymous: boolean;
      chatSessionCount: number;
      fileCount: number;
      limits: { maxChatSessions: number; maxFiles: number };
    }>('GET', '/users/profile');
  }

  listModels() {
    return this.request<ModelSummary[]>('GET', '/ai/models');
  }

  prompt(request: PromptRequest) {
    return this.request<PromptResult>('POST', '/ai/prompt', { body: request });
  }

  listSessions(params: { limit?: number; cursor?: string } = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.cursor) query.set('cursor', params.cursor);
    const suffix = query.toString() ? `?${query}` : '';
    return this.request<{ sessions: unknown[]; nextCursor: string | null }>(
      'GET',
      `/chat/sessions${suffix}`,
    );
  }

  listFiles() {
    return this.request<
      Array<{ id: string; filename: string; folder: string; fileType: string; size: number }>
    >('GET', '/files');
  }

  listConnectedKeys() {
    return this.request<Array<{ provider: string; hint: string }>>('GET', '/byok');
  }

  connectKey(provider: string, apiKey: string) {
    return this.request<{ provider: string; hint: string }>('POST', '/byok', {
      body: { provider, api_key: apiKey },
    });
  }

  disconnectKey(provider: string) {
    return this.request<void>('DELETE', `/byok/${provider}`);
  }

  // --- streaming ----------------------------------------------------------

  /**
   * Streams an answer. Yields decoded events in order; the caller decides what
   * to render. Aborting the signal stops the read without leaving the response
   * body open.
   */
  async *stream(
    request: PromptRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const token = await this.options.getToken();
    const response = await fetch(`${this.baseUrl}/ai/prompt/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      // The stream never opened, so this is an ordinary error response.
      throw new ApiError(response.status, await readErrorBody(response));
    }
    if (!response.body) {
      throw new ApiError(response.status, {
        statusCode: response.status,
        message: 'The server returned no stream to read',
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          const event = decodeFrame(frame.event, frame.data);
          if (event) yield event;
        }
      }

      for (const frame of parser.flush()) {
        const event = decodeFrame(frame.event, frame.data);
        if (event) yield event;
      }
    } finally {
      // Releasing matters on abort: an unreleased reader keeps the connection.
      reader.releaseLock();
    }
  }

  // --- plumbing -----------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const useAuth = options.auth !== false;
    const token = useAuth ? await this.options.getToken() : undefined;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    if (response.status === 401 && useAuth) {
      await this.options.onUnauthorized?.();
    }

    if (!response.ok) {
      throw new ApiError(response.status, await readErrorBody(response));
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    // A proxy or crash can return HTML; never let that mask the status.
    return { statusCode: response.status, message: response.statusText };
  }
}

function decodeFrame(event: string, data: string): StreamEvent | undefined {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  switch (event) {
    case 'session':
      return { type: 'session', sessionId: String(payload.session_id) };
    case 'delta':
      return { type: 'delta', text: String(payload.text ?? '') };
    case 'redirect':
      return { type: 'redirect', redirect: payload as unknown as RedirectAnswer };
    case 'done':
      return { type: 'done' };
    case 'error':
      return { type: 'error', message: String(payload.message ?? 'Stream failed') };
    default:
      return undefined;
  }
}
