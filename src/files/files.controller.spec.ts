import { Response } from 'express';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { AuthUser } from '../auth/auth.service';

describe('FilesController', () => {
  let controller: FilesController;
  let service: {
    getUserFiles: jest.Mock;
    getFileContent: jest.Mock;
    deleteFile: jest.Mock;
  };
  let res: Response;

  const user: AuthUser = { id: 'u1' };

  beforeEach(() => {
    service = {
      getUserFiles: jest.fn().mockResolvedValue([]),
      getFileContent: jest.fn().mockResolvedValue({
        file: { filename: 'fib.ts' },
        content: 'export const fib = () => 1;',
      }),
      deleteFile: jest.fn().mockResolvedValue({ success: true }),
    };
    controller = new FilesController(service as unknown as FilesService);

    res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as unknown as Response;
  });

  it('lists only the caller’s files', async () => {
    await controller.getUserFiles(user);
    expect(service.getUserFiles).toHaveBeenCalledWith('u1');
  });

  it('scopes deletion to the caller', async () => {
    await controller.deleteFile('f1', user);
    expect(service.deleteFile).toHaveBeenCalledWith('u1', 'f1');
  });

  describe('download', () => {
    it('sends the body as an attachment named after the file', async () => {
      await controller.downloadFile('f1', user, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="fib.ts"',
      );
      expect(res.send).toHaveBeenCalledWith('export const fib = () => 1;');
    });

    it('scopes the lookup to the caller', async () => {
      await controller.downloadFile('f1', user, res);
      expect(service.getFileContent).toHaveBeenCalledWith('u1', 'f1');
    });

    it('encodes a filename that would otherwise break the header', async () => {
      service.getFileContent.mockResolvedValue({
        file: { filename: 'my "report" .txt' },
        content: 'x',
      });

      await controller.downloadFile('f1', user, res);

      const [, value] = (res.setHeader as jest.Mock).mock.calls.find(
        ([name]) => name === 'Content-Disposition',
      );
      expect(value).not.toContain('"report"');
    });
  });
});
