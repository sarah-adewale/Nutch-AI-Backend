import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/files/abc', method: 'DELETE' }),
      }),
    } as unknown as ArgumentsHost;

    // The filter logs 5xx stacks; keep test output readable.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('preserves the status of an HttpException', () => {
    filter.catch(new NotFoundException('File not found'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'File not found',
        path: '/api/v1/files/abc',
      }),
    );
  });

  it('keeps the array of messages produced by ValidationPipe', () => {
    filter.catch(
      new BadRequestException(['model must be a string', 'prompt is required']),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: ['model must be a string', 'prompt is required'],
      }),
    );
  });

  it('maps a Prisma missing-record error to 404', () => {
    filter.catch(
      { code: 'P2025', message: 'Record to delete not found' },
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, error: 'P2025' }),
    );
  });

  it('maps a Prisma unique constraint error to 409', () => {
    filter.catch({ code: 'P2002', message: 'Unique failed' }, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
  });

  it('falls back to 500 for an unrecognised Prisma code', () => {
    filter.catch({ code: 'P9999', message: 'Something else' }, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('does not leak the message of an unexpected error', () => {
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.1:5432'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal server error' }),
    );
  });

  it('handles a thrown value that is not an Error at all', () => {
    filter.catch('kaboom', host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('stamps every response with a path and timestamp', () => {
    filter.catch(new NotFoundException(), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/v1/files/abc',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
  });
});
