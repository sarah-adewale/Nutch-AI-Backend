import { Response } from 'express';
import { AiRouterController } from './ai-router.controller';
import { AiRouterService } from './ai-router.service';
import { AuthUser } from '../auth/auth.service';

describe('AiRouterController', () => {
  let controller: AiRouterController;
  let service: {
    listAvailableModels: jest.Mock;
    processPrompt: jest.Mock;
    streamPrompt: jest.Mock;
  };
  let res: Response;
  let written: string[];

  const user: AuthUser = { id: 'u1' };
  const body = {
    model: 'claude-opus-5',
    input_type: 'text',
    prompt: 'hi',
  } as never;

  const events = () =>
    written
      .join('')
      .split('\n\n')
      .filter(Boolean)
      .map((frame) => {
        const [event, data] = frame.split('\n');
        return {
          event: event.replace('event: ', ''),
          data: JSON.parse(data.replace('data: ', '')),
        };
      });

  beforeEach(() => {
    written = [];
    service = {
      listAvailableModels: jest.fn().mockResolvedValue([]),
      processPrompt: jest.fn().mockResolvedValue({ response: 'ok' }),
      streamPrompt: jest.fn(),
    };
    controller = new AiRouterController(service as unknown as AiRouterService);

    res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => written.push(chunk)),
      end: jest.fn(),
    } as unknown as Response;
  });

  it('scopes the model list to the caller', async () => {
    await controller.listModels(user);
    expect(service.listAvailableModels).toHaveBeenCalledWith('u1');
  });

  it('passes the authenticated user, not a body-supplied id', async () => {
    await controller.processPrompt(body, user);
    expect(service.processPrompt).toHaveBeenCalledWith(body, 'u1');
  });

  describe('streaming', () => {
    const drive = async (
      chunks: Array<Record<string, unknown>>,
      fail?: Error,
    ) => {
      service.streamPrompt.mockImplementation(async function* () {
        for (const chunk of chunks) yield chunk;
        if (fail) throw fail;
      });
      await controller.streamPrompt(body, user, res);
    };

    it('sets the event-stream headers before writing', async () => {
      await drive([]);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('frames session and delta events', async () => {
      await drive([
        { type: 'session', sessionId: 's1' },
        { type: 'delta', text: 'he' },
        { type: 'delta', text: 'llo' },
      ]);

      expect(events()).toEqual([
        { event: 'session', data: { session_id: 's1' } },
        { event: 'delta', data: { text: 'he' } },
        { event: 'delta', data: { text: 'llo' } },
        { event: 'done', data: {} },
      ]);
    });

    it('frames a redirect', async () => {
      await drive([
        { type: 'redirect', redirect: { redirect: true, tool: 'Midjourney' } },
      ]);

      expect(events()[0]).toEqual({
        event: 'redirect',
        data: { redirect: true, tool: 'Midjourney' },
      });
    });

    it('reports a failure as an error event, since the status is already sent', async () => {
      await drive([{ type: 'delta', text: 'partial' }], new Error('upstream'));

      const last = events()[events().length - 1];
      expect(last.event).toBe('error');
      expect(last.data).toEqual({ message: 'upstream' });
    });

    it('always closes the response', async () => {
      await drive([], new Error('boom'));
      expect(res.end).toHaveBeenCalled();
    });

    it('does not emit done after an error', async () => {
      await drive([], new Error('boom'));
      expect(events().map((e) => e.event)).not.toContain('done');
    });
  });
});
