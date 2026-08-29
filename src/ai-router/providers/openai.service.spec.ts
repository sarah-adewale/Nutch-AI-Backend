import { ConfigService } from '@nestjs/config';
import OpenAiSdk from 'openai';
import { OpenAiService } from './openai.service';

const create = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((opts: { apiKey?: string }) => ({
    _apiKey: opts.apiKey,
    chat: { completions: { create } },
  })),
}));

// jest.mock is hoisted above the imports, so this is the mock constructor.
const OpenAI = OpenAiSdk as unknown as jest.Mock;

describe('OpenAiService', () => {
  const config = (key?: string) =>
    ({ get: () => key }) as unknown as ConfigService;

  beforeEach(() => {
    create.mockReset();
    OpenAI.mockClear();
    create.mockResolvedValue({
      choices: [{ message: { content: 'hello' } }],
    });
  });

  it('reports configuration from the environment key', () => {
    expect(new OpenAiService(config(undefined)).isConfigured()).toBe(false);
    expect(new OpenAiService(config('sk-env')).isConfigured()).toBe(true);
  });

  it('returns an empty string rather than undefined when a choice has no content', async () => {
    create.mockResolvedValue({ choices: [] });

    const result = await new OpenAiService(config('k')).generate({
      model: 'gpt-4o',
      prompt: 'hi',
      maxOutputTokens: 4096,
    });

    expect(result.text).toBe('');
  });

  it('prepends context as a system message', async () => {
    await new OpenAiService(config('k')).generate({
      model: 'gpt-4o',
      prompt: 'hi',
      context: 'Be terse.',
      maxOutputTokens: 4096,
    });

    const [args] = create.mock.calls[0];
    expect(args.messages[0]).toEqual({ role: 'system', content: 'Be terse.' });
    expect(args.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('sends an image as a multipart user message', async () => {
    await new OpenAiService(config('k')).generate({
      model: 'gpt-4o',
      prompt: 'what is this?',
      imageUrl: 'https://example.com/a.png',
      maxOutputTokens: 4096,
    });

    const [args] = create.mock.calls[0];
    expect(args.messages[0].content).toEqual([
      { type: 'text', text: 'what is this?' },
      { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
    ]);
  });

  it('prefers a user supplied key', async () => {
    await new OpenAiService(config('sk-env')).generate({
      model: 'gpt-4o',
      prompt: 'hi',
      maxOutputTokens: 4096,
      apiKey: 'sk-user',
    });

    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'sk-user' });
  });

  it('yields only non-empty deltas when streaming', async () => {
    create.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'a' } }] };
        yield { choices: [{ delta: {} }] };
        yield { choices: [{ delta: { content: 'b' } }] };
      })(),
    );

    const out: string[] = [];
    for await (const delta of new OpenAiService(config('k')).stream({
      model: 'gpt-4o',
      prompt: 'hi',
      maxOutputTokens: 4096,
    })) {
      out.push(delta);
    }

    expect(out).toEqual(['a', 'b']);
  });

  it('sets the stream flag on a streaming request', async () => {
    create.mockResolvedValue((async function* () {})());

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of new OpenAiService(config('k')).stream({
      model: 'gpt-4o',
      prompt: 'hi',
      maxOutputTokens: 4096,
    })) {
      // drain
    }

    expect(create.mock.calls[0][0].stream).toBe(true);
  });
});
