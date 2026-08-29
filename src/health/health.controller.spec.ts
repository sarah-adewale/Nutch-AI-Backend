import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let queryRaw: jest.Mock;
  let json: jest.Mock;
  let status: jest.Mock;
  let res: Response;

  beforeEach(() => {
    queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    controller = new HealthController({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    res = { status } as unknown as Response;
  });

  it('reports ok and 200 when the database answers', async () => {
    await controller.check(res);

    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', checks: { database: 'up' } }),
    );
  });

  it('reports degraded and 503 when the database throws', async () => {
    queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

    await controller.check(res);

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        checks: { database: 'down' },
      }),
    );
  });

  it('never rejects, so a probe gets an answer rather than a hang', async () => {
    queryRaw.mockRejectedValue(new Error('boom'));

    await expect(controller.buildReport()).resolves.toEqual(
      expect.objectContaining({ status: 'degraded' }),
    );
  });

  it('includes uptime as a whole number of seconds', async () => {
    const report = await controller.buildReport();

    expect(Number.isInteger(report.uptime)).toBe(true);
    expect(report.uptime).toBeGreaterThanOrEqual(0);
  });
});
