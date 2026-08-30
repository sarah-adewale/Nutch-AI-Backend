import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { FilesService } from '../files/files.service';
import { ByokService } from '../byok/byok.service';
import { UsersService } from '../users/users.service';
import { LimitExceededException } from '../limits/limit-exceeded.exception';
import { ProviderException } from './providers/provider-error';
import { AiRouterService } from './ai-router.service';
import { AnthropicService } from './providers/anthropic.service';
import { OpenAiService } from './providers/openai.service';
import { PromptRequestDto } from './dto/prompt-request.dto';

const basePrompt = (over: Partial<PromptRequestDto> = {}): PromptRequestDto =>
  ({
    model: 'claude-opus-5',
    input_type: 'text',
    prompt: 'Explain this function',
    ...over,
  }) as PromptRequestDto;

async function* textStream(...chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

describe('AiRouterService', () => {
  let service: AiRouterService;
  let anthropic: {
    name: string;
    isConfigured: jest.Mock;
    generate: jest.Mock;
    stream: jest.Mock;
  };
  let openai: typeof anthropic;
  let chat: {
    createChatSession: jest.Mock;
    getChatSession: jest.Mock;
    addMessage: jest.Mock;
  };
  let files: { createFile: jest.Mock };
  let byok: { decryptFor: jest.Mock; providersWithKeys: jest.Mock };
  let users: { isAnonymous: jest.Mock };

  const makeProvider = (name: string) => ({
    name,
    isConfigured: jest.fn().mockReturnValue(true),
    generate: jest.fn().mockResolvedValue({
      text: 'the answer',
      modelUsed: 'claude-opus-5',
      provider: name,
    }),
    stream: jest.fn().mockImplementation(() => textStream('the ', 'answer')),
  });

  beforeEach(() => {
    anthropic = makeProvider('anthropic');
    openai = makeProvider('openai');
    chat = {
      createChatSession: jest.fn().mockResolvedValue({ id: 'sess1' }),
      getChatSession: jest.fn().mockResolvedValue({ id: 'existing' }),
      addMessage: jest.fn().mockResolvedValue({}),
    };

    files = {
      createFile: jest
        .fn()
        .mockImplementation((_u, filename, _c, fileType) => ({
          id: 'f1',
          filename,
          fileType,
          folder: fileType === 'ts' ? '/code' : '/documents',
        })),
    };

    byok = {
      decryptFor: jest.fn().mockResolvedValue(undefined),
      providersWithKeys: jest.fn().mockResolvedValue(new Set()),
    };
    users = { isAnonymous: jest.fn().mockResolvedValue(false) };

    service = new AiRouterService(
      openai as unknown as OpenAiService,
      anthropic as unknown as AnthropicService,
      chat as unknown as ChatService,
      files as unknown as FilesService,
      byok as unknown as ByokService,
      users as unknown as UsersService,
    );
  });

  describe('routing', () => {
    it('sends a Claude model to the Anthropic provider', async () => {
      await service.processPrompt(basePrompt(), 'u1');

      expect(anthropic.generate).toHaveBeenCalled();
      expect(openai.generate).not.toHaveBeenCalled();
    });

    it('sends a GPT model to the OpenAI provider', async () => {
      await service.processPrompt(basePrompt({ model: 'gpt-4o' }), 'u1');

      expect(openai.generate).toHaveBeenCalled();
      expect(anthropic.generate).not.toHaveBeenCalled();
    });

    it('rejects an unknown model with 400', async () => {
      await expect(
        service.processPrompt(basePrompt({ model: 'gpt-9' }), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('answers 503 when the provider has no key configured', async () => {
      anthropic.isConfigured.mockReturnValue(false);

      await expect(service.processPrompt(basePrompt(), 'u1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('passes the model’s own output cap to the provider', async () => {
      await service.processPrompt(basePrompt({ model: 'gpt-4o' }), 'u1');

      const [params] = openai.generate.mock.calls[0];
      expect(params.maxOutputTokens).toBe(4096);
    });

    it('forwards context as the system instruction', async () => {
      await service.processPrompt(
        basePrompt({ context: 'You are terse.' }),
        'u1',
      );

      const [params] = anthropic.generate.mock.calls[0];
      expect(params.context).toBe('You are terse.');
    });
  });

  describe('image input', () => {
    it('requires an image_url when input_type is image', async () => {
      await expect(
        service.processPrompt(basePrompt({ input_type: 'image' }), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an image for a model without vision', async () => {
      await expect(
        service.processPrompt(
          basePrompt({
            model: 'gpt-4',
            input_type: 'image',
            image_url: 'https://example.com/a.png',
          }),
          'u1',
        ),
      ).rejects.toThrow(/cannot read images/);
    });

    it('reports a malformed request as 400 even when no key is configured', async () => {
      anthropic.isConfigured.mockReturnValue(false);

      await expect(
        service.processPrompt(basePrompt({ input_type: 'image' }), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('forwards the image to a vision-capable model', async () => {
      await service.processPrompt(
        basePrompt({
          input_type: 'image',
          image_url: 'https://example.com/a.png',
        }),
        'u1',
      );

      const [params] = anthropic.generate.mock.calls[0];
      expect(params.imageUrl).toBe('https://example.com/a.png');
    });
  });

  describe('session handling', () => {
    it('creates a session when none is supplied', async () => {
      const result = await service.processPrompt(basePrompt(), 'u1');

      expect(chat.createChatSession).toHaveBeenCalledWith(
        'u1',
        'claude-opus-5',
        'Explain this function',
      );
      expect(result.session_id).toBe('sess1');
    });

    it('continues an existing session, scoped to the owner', async () => {
      const result = await service.processPrompt(
        basePrompt({ session_id: 'existing' }),
        'u1',
      );

      expect(chat.getChatSession).toHaveBeenCalledWith('existing', 'u1');
      expect(chat.createChatSession).not.toHaveBeenCalled();
      expect(result.session_id).toBe('existing');
    });

    it('rejects a session belonging to someone else', async () => {
      chat.getChatSession.mockResolvedValue(null);

      await expect(
        service.processPrompt(basePrompt({ session_id: 'theirs' }), 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('truncates a long first prompt into a readable title', async () => {
      await service.processPrompt(
        basePrompt({ prompt: 'x'.repeat(200) }),
        'u1',
      );

      const [, , title] = chat.createChatSession.mock.calls[0];
      expect(title.length).toBe(60);
      expect(title.endsWith('…')).toBe(true);
    });

    it('collapses whitespace when deriving the title', async () => {
      await service.processPrompt(
        basePrompt({ prompt: '  what\n\n is   this?  ' }),
        'u1',
      );

      const [, , title] = chat.createChatSession.mock.calls[0];
      expect(title).toBe('what is this?');
    });
  });

  describe('persistence', () => {
    it('stores the user prompt and the assistant reply', async () => {
      await service.processPrompt(basePrompt(), 'u1');

      expect(chat.addMessage).toHaveBeenCalledTimes(2);
      const [userCall, assistantCall] = chat.addMessage.mock.calls;
      expect(userCall[1]).toBe('user');
      expect(userCall[2]).toBe('Explain this function');
      expect(assistantCall[1]).toBe('assistant');
      expect(assistantCall[2]).toBe('the answer');
    });

    it('records which model produced the reply', async () => {
      await service.processPrompt(basePrompt(), 'u1');

      const [, , , , , modelUsed] = chat.addMessage.mock.calls[1];
      expect(modelUsed).toBe('claude-opus-5');
    });

    it('does not persist an assistant message when the provider fails', async () => {
      anthropic.generate.mockRejectedValue(new Error('upstream down'));

      await expect(service.processPrompt(basePrompt(), 'u1')).rejects.toThrow(
        ProviderException,
      );

      expect(chat.addMessage).toHaveBeenCalledTimes(1);
      expect(chat.addMessage.mock.calls[0][1]).toBe('user');
    });
  });

  describe('streaming', () => {
    const drain = async (gen: AsyncGenerator<unknown>) => {
      const out: unknown[] = [];
      for await (const item of gen) out.push(item);
      return out;
    };

    it('emits the session id before any delta', async () => {
      const events = await drain(service.streamPrompt(basePrompt(), 'u1'));

      expect(events[0]).toEqual({ type: 'session', sessionId: 'sess1' });
      expect(events.slice(1)).toEqual([
        { type: 'delta', text: 'the ' },
        { type: 'delta', text: 'answer' },
      ]);
    });

    it('persists the assembled reply once the stream completes', async () => {
      await drain(service.streamPrompt(basePrompt(), 'u1'));

      const assistant = chat.addMessage.mock.calls.find(
        (c) => c[1] === 'assistant',
      );
      expect(assistant?.[2]).toBe('the answer');
    });

    it('persists the partial reply when the stream breaks mid-way', async () => {
      anthropic.stream.mockImplementation(async function* () {
        yield 'half ';
        throw new Error('connection lost');
      });

      // The raw SDK error is wrapped, so assert the classification instead of
      // the upstream message.
      await expect(
        drain(service.streamPrompt(basePrompt(), 'u1')),
      ).rejects.toThrow(ProviderException);

      const assistant = chat.addMessage.mock.calls.find(
        (c) => c[1] === 'assistant',
      );
      expect(assistant?.[2]).toBe('half ');
    });

    it('writes no assistant message when nothing was produced', async () => {
      anthropic.stream.mockImplementation(() => textStream());

      await drain(service.streamPrompt(basePrompt(), 'u1'));

      expect(
        chat.addMessage.mock.calls.filter((c) => c[1] === 'assistant'),
      ).toHaveLength(0);
    });
  });

  describe('listAvailableModels', () => {
    it('reports availability from the provider key state', async () => {
      openai.isConfigured.mockReturnValue(false);

      const models = await service.listAvailableModels('u1');
      const gpt = models.find((m) => m.id === 'gpt-4o');
      const claude = models.find((m) => m.id === 'claude-opus-5');

      expect(gpt?.available).toBe(false);
      expect(claude?.available).toBe(true);
    });

    it('labels models as running on the Nutch key by default', async () => {
      const models = await service.listAvailableModels('u1');
      expect(models.every((m) => m.source === 'nutch')).toBe(true);
    });

    it('labels a model as user-owned when a key is connected', async () => {
      byok.providersWithKeys.mockResolvedValue(new Set(['anthropic']));

      const models = await service.listAvailableModels('u1');

      expect(models.find((m) => m.id === 'claude-opus-5')?.source).toBe('user');
      expect(models.find((m) => m.id === 'gpt-4o')?.source).toBe('nutch');
    });

    it('makes a model available on a connected key even with no Nutch key', async () => {
      openai.isConfigured.mockReturnValue(false);
      byok.providersWithKeys.mockResolvedValue(new Set(['openai']));

      const models = await service.listAvailableModels('u1');

      expect(models.find((m) => m.id === 'gpt-4o')?.available).toBe(true);
    });

    it('locks every non-default model for an anonymous user', async () => {
      users.isAnonymous.mockResolvedValue(true);

      const models = await service.listAvailableModels('u1');

      expect(models.find((m) => m.id === 'claude-opus-5')?.locked).toBe(false);
      expect(models.filter((m) => m.locked).length).toBe(models.length - 1);
    });

    it('ignores connected keys for an anonymous user', async () => {
      users.isAnonymous.mockResolvedValue(true);

      await service.listAvailableModels('u1');

      expect(byok.providersWithKeys).not.toHaveBeenCalled();
    });
  });

  describe('file generation', () => {
    const withCode = (text: string) =>
      anthropic.generate.mockResolvedValue({
        text,
        modelUsed: 'claude-opus-5',
        provider: 'anthropic',
      });

    it('saves a fenced code block as a file', async () => {
      withCode(
        'Here:\n```typescript\nexport const add = (a, b) => a + b;\n```',
      );

      const result = await service.processPrompt(basePrompt(), 'u1');

      expect(files.createFile).toHaveBeenCalledTimes(1);
      expect(result.files[0].folder).toBe('/code');
      expect(result.file_type).toBe('ts');
    });

    it('saves nothing for a prose-only answer', async () => {
      withCode('Just an explanation, no code at all here.');

      const result = await service.processPrompt(basePrompt(), 'u1');

      expect(files.createFile).not.toHaveBeenCalled();
      expect(result.files).toEqual([]);
      expect(result.folder).toBe('/documents');
    });

    it('names files from the prompt', async () => {
      withCode('```typescript\nexport const add = (a, b) => a + b;\n```');

      await service.processPrompt(
        basePrompt({ prompt: 'Write an add function' }),
        'u1',
      );

      const [, filename] = files.createFile.mock.calls[0];
      expect(filename).toBe('write-an-add-function-1.ts');
    });

    it('still returns the answer when the storage cap is hit', async () => {
      withCode('```typescript\nexport const add = (a, b) => a + b;\n```');
      files.createFile.mockRejectedValue(
        new LimitExceededException('files', 5, 5),
      );

      const result = await service.processPrompt(basePrompt(), 'u1');

      // The completion is already paid for; failing the request would waste it.
      expect(result.response).toContain('export const add');
      expect(result.storage_limit_reached).toBe(true);
      expect(result.files).toEqual([]);
    });

    it('propagates an unexpected storage failure', async () => {
      withCode('```typescript\nexport const add = (a, b) => a + b;\n```');
      files.createFile.mockRejectedValue(new Error('disk on fire'));

      await expect(service.processPrompt(basePrompt(), 'u1')).rejects.toThrow(
        'disk on fire',
      );
    });

    it('stops saving after the first refusal rather than retrying each block', async () => {
      withCode(
        '```ts\nexport const a = () => 1234567;\n```\n```py\nprint("a long enough block")\n```',
      );
      files.createFile.mockRejectedValue(
        new LimitExceededException('files', 5, 5),
      );

      await service.processPrompt(basePrompt(), 'u1');

      expect(files.createFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('provider failures', () => {
    const rejectWith = (status: number, message: string) =>
      anthropic.generate.mockRejectedValue(
        Object.assign(new Error(message), { status }),
      );

    it('turns an unfunded key into 402 rather than 500', async () => {
      rejectWith(400, 'Your credit balance is too low');

      await expect(
        service.processPrompt(basePrompt(), 'u1'),
      ).rejects.toMatchObject({ status: 402 });
    });

    it('names the provider that failed', async () => {
      rejectWith(500, 'overloaded');

      try {
        await service.processPrompt(basePrompt(), 'u1');
        throw new Error('expected a rejection');
      } catch (error) {
        expect((error as ProviderException).getResponse()).toMatchObject({
          provider: 'anthropic',
          failure: 'unavailable',
        });
      }
    });

    it('classifies a streaming failure the same way', async () => {
      anthropic.stream.mockImplementation(async function* () {
        yield 'partial';
        throw Object.assign(new Error('Rate limit exceeded'), { status: 429 });
      });

      const gen = service.streamPrompt(basePrompt(), 'u1');
      await expect(
        (async () => {
          for await (const _ of gen) {
            void _;
          }
        })(),
      ).rejects.toMatchObject({ status: 429 });
    });

    it('still persists the partial reply when a stream fails upstream', async () => {
      anthropic.stream.mockImplementation(async function* () {
        yield 'partial answer';
        throw Object.assign(new Error('boom'), { status: 500 });
      });

      const gen = service.streamPrompt(basePrompt(), 'u1');
      await expect(
        (async () => {
          for await (const _ of gen) {
            void _;
          }
        })(),
      ).rejects.toThrow();

      const assistant = chat.addMessage.mock.calls.find(
        (c) => c[1] === 'assistant',
      );
      expect(assistant?.[2]).toBe('partial answer');
    });
  });

  describe('BYOK routing', () => {
    it('passes a connected key to the provider', async () => {
      byok.decryptFor.mockResolvedValue('sk-ant-user-key');

      const result = await service.processPrompt(basePrompt(), 'u1');

      const [params] = anthropic.generate.mock.calls[0];
      expect(params.apiKey).toBe('sk-ant-user-key');
      expect(result.key_source).toBe('user');
    });

    it('falls back to the Nutch key when none is connected', async () => {
      const result = await service.processPrompt(basePrompt(), 'u1');

      const [params] = anthropic.generate.mock.calls[0];
      expect(params.apiKey).toBeUndefined();
      expect(result.key_source).toBe('nutch');
    });

    it('looks up the key for the resolved provider only', async () => {
      await service.processPrompt(basePrompt({ model: 'gpt-4o' }), 'u1');

      expect(byok.decryptFor).toHaveBeenCalledWith('u1', 'openai');
    });

    it('never consults BYOK for an anonymous user', async () => {
      users.isAnonymous.mockResolvedValue(true);

      await service.processPrompt(basePrompt(), 'u1');

      expect(byok.decryptFor).not.toHaveBeenCalled();
    });

    it('serves a model that only the connected key can reach', async () => {
      anthropic.isConfigured.mockImplementation((key?: string) => Boolean(key));
      byok.decryptFor.mockResolvedValue('sk-ant-user-key');

      await expect(
        service.processPrompt(basePrompt(), 'u1'),
      ).resolves.toMatchObject({ key_source: 'user' });
    });
  });

  describe('model switching gate', () => {
    it('refuses a non-default model for an anonymous user', async () => {
      users.isAnonymous.mockResolvedValue(true);

      await expect(
        service.processPrompt(basePrompt({ model: 'gpt-4o' }), 'u1'),
      ).rejects.toThrow(/Sign in to switch models/);
    });

    it('allows the default model for an anonymous user', async () => {
      users.isAnonymous.mockResolvedValue(true);

      await expect(
        service.processPrompt(basePrompt({ model: 'claude-opus-5' }), 'u1'),
      ).resolves.toBeDefined();
    });

    it('allows any model for a signed-in user', async () => {
      await expect(
        service.processPrompt(basePrompt({ model: 'gpt-4o' }), 'u1'),
      ).resolves.toBeDefined();
    });
  });
});
