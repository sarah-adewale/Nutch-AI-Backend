import { ConfigService } from '@nestjs/config';
import AnthropicSdk from '@anthropic-ai/sdk';
import { AnthropicService } from './anthropic.service';

const create = jest.fn();
const streamFn = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((opts: { apiKey?: string }) => ({
      _apiKey: opts.apiKey,
      messages: { create, stream: streamFn },
    })),
  };
});

// jest.mock is hoisted above the imports, so this is the mock constructor.
const Anthropic = AnthropicSdk as unknown as jest.Mock;

describe('AnthropicService', () => {
  const config = (key?: string) =>
    ({ get: () => key }) as unknown as ConfigService;

  beforeEach(() => {
    create.mockReset();
    streamFn.mockReset();
    Anthropic.mockClear();
    create.mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
    });
  });

  describe('isConfigured', () => {
    it('is false when no key is available anywhere', () => {
      expect(new AnthropicService(config(undefined)).isConfigured()).toBe(
        false,
      );
    });

    it('is true from the environment key', () => {
      expect(new AnthropicService(config('sk-ant-env')).isConfigured()).toBe(
        true,
      );
    });

    it('is true from a user supplied key even with no environment key', () => {
      expect(
        new AnthropicService(config(undefined)).isConfigured('sk-ant-user'),
      ).toBe(true);
    });
  });

  describe('generate', () => {
    it('joins every text block in the response', async () => {
      create.mockResolvedValue({
        content: [
          { type: 'text', text: 'part one ' },
          { type: 'thinking', thinking: 'ignored' },
          { type: 'text', text: 'part two' },
        ],
      });

      const result = await new AnthropicService(config('k')).generate({
        model: 'claude-opus-5',
        prompt: 'hi',
        maxOutputTokens: 8192,
      });

      expect(result.text).toBe('part one part two');
      expect(result.provider).toBe('anthropic');
    });

    it('sends context as the system parameter, not as a message', async () => {
      await new AnthropicService(config('k')).generate({
        model: 'claude-opus-5',
        prompt: 'hi',
        context: 'Be terse.',
        maxOutputTokens: 8192,
      });

      const [args] = create.mock.calls[0];
      expect(args.system).toBe('Be terse.');
      expect(args.messages).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('omits the system field entirely when there is no context', async () => {
      await new AnthropicService(config('k')).generate({
        model: 'claude-opus-5',
        prompt: 'hi',
        maxOutputTokens: 8192,
      });

      expect('system' in create.mock.calls[0][0]).toBe(false);
    });

    it('builds an image content block when an image url is given', async () => {
      await new AnthropicService(config('k')).generate({
        model: 'claude-opus-5',
        prompt: 'what is this?',
        imageUrl: 'https://example.com/a.png',
        maxOutputTokens: 8192,
      });

      const [args] = create.mock.calls[0];
      expect(args.messages[0].content).toEqual([
        {
          type: 'image',
          source: { type: 'url', url: 'https://example.com/a.png' },
        },
        { type: 'text', text: 'what is this?' },
      ]);
    });

    it('prefers a user supplied key over the environment key', async () => {
      await new AnthropicService(config('sk-ant-env')).generate({
        model: 'claude-opus-5',
        prompt: 'hi',
        maxOutputTokens: 8192,
        apiKey: 'sk-ant-user',
      });

      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-user' });
    });

    it('builds a fresh client per call so keys are not shared between users', async () => {
      const service = new AnthropicService(config('sk-ant-env'));
      const params = {
        model: 'claude-opus-5',
        prompt: 'hi',
        maxOutputTokens: 8192,
      };

      await service.generate({ ...params, apiKey: 'user-a' });
      await service.generate({ ...params, apiKey: 'user-b' });

      expect(Anthropic).toHaveBeenNthCalledWith(1, { apiKey: 'user-a' });
      expect(Anthropic).toHaveBeenNthCalledWith(2, { apiKey: 'user-b' });
    });
  });

  describe('stream', () => {
    it('yields only text deltas', async () => {
      streamFn.mockReturnValue(
        (async function* () {
          yield { type: 'message_start' };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'a' },
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'thinking_delta', thinking: 'x' },
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'b' },
          };
        })(),
      );

      const out: string[] = [];
      for await (const delta of new AnthropicService(config('k')).stream({
        model: 'claude-opus-5',
        prompt: 'hi',
        maxOutputTokens: 8192,
      })) {
        out.push(delta);
      }

      expect(out).toEqual(['a', 'b']);
    });
  });
});
