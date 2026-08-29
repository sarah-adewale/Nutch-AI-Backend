import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

/** Prisma error codes we can map onto a meaningful status. */
const PRISMA_STATUS: Record<string, { status: number; message: string }> = {
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Resource not found' },
  P2002: { status: HttpStatus.CONFLICT, message: 'Resource already exists' },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Related resource does not exist',
  },
};

function isPrismaError(err: unknown): err is { code: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    /^P\d{4}$/.test((err as { code: string }).code)
  );
}

/**
 * Turns anything thrown by a handler into a consistent JSON body.
 *
 * Without this, a bare `throw new Error(...)` in a service surfaces as a 500,
 * which the extension cannot tell apart from the backend being down.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // ValidationPipe returns { message: string[], error, statusCode }.
      if (typeof payload === 'object' && payload !== null) {
        const shaped = payload as Partial<ErrorBody>;
        return {
          status,
          message: shaped.message ?? exception.message,
          error: shaped.error ?? HttpStatus[status] ?? 'Error',
        };
      }

      return { status, message: String(payload), error: exception.name };
    }

    if (isPrismaError(exception)) {
      const mapped = PRISMA_STATUS[exception.code];
      if (mapped) {
        return {
          status: mapped.status,
          message: mapped.message,
          error: exception.code,
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'InternalServerError',
    };
  }
}
