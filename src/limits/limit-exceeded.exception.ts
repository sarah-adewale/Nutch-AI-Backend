import { HttpException, HttpStatus } from '@nestjs/common';

export type LimitedResource = 'chat_sessions' | 'files';

export interface LimitDetails {
  error: 'LIMIT_REACHED';
  message: string;
  resource: LimitedResource;
  limit: number;
  current: number;
  /** What the sidebar should offer. Anonymous users convert by signing in. */
  action: 'sign_in';
}

const LABEL: Record<LimitedResource, string> = {
  chat_sessions: 'chat sessions',
  files: 'stored files',
};

/**
 * A distinct, machine-readable error so the extension can show a specific
 * nudge at the ceiling rather than a generic failure. Login conversion at the
 * free-tier limit is a tracked KPI, so the response carries the numbers the
 * UI needs to explain itself.
 */
export class LimitExceededException extends HttpException {
  constructor(resource: LimitedResource, limit: number, current: number) {
    const details: LimitDetails = {
      error: 'LIMIT_REACHED',
      message: `Anonymous sessions are limited to ${limit} ${LABEL[resource]}. Sign in to keep going.`,
      resource,
      limit,
      current,
      action: 'sign_in',
    };
    super(details, HttpStatus.FORBIDDEN);
  }
}
