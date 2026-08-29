import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
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

    service = new AiRouterService(
      openai as unknown as OpenAiService,
      anthropic as unknown as AnthropicService,
      chat as unknown as ChatService,
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

      await expect(service.processPrompt(basePrompt(), 'u1')).rejects.toThrow();

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

      await expect(
        drain(service.streamPrompt(basePrompt(), 'u1')),
      ).rejects.toThrow('connection lost');

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
    it('reports availability from the provider key state', () => {
      openai.isConfigured.mockReturnValue(false);

      const models = service.listAvailableModels();
      const gpt = models.find((m) => m.id === 'gpt-4o');
      const claude = models.find((m) => m.id === 'claude-opus-5');

      expect(gpt?.available).toBe(false);
      expect(claude?.available).toBe(true);
    });

    it('labels the key source so the switcher can show it', () => {
      expect(
        service.listAvailableModels().every((m) => m.source === 'nutch'),
      ).toBe(true);
    });
  });
});
