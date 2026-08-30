import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AiCompletion,
  AiProvider,
  GenerateParams,
  ProviderName,
} from './ai-provider.interface';
import { isUsableApiKey } from './api-key';

@Injectable()
export class OpenAiService implements AiProvider {
  readonly name: ProviderName = 'openai';

  constructor(private configService: ConfigService) {}

  isConfigured(apiKey?: string): boolean {
    return isUsableApiKey(this.resolveKey(apiKey));
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      await this.client(apiKey).models.list();
      return true;
    } catch {
      return false;
    }
  }

  async generate(params: GenerateParams): Promise<AiCompletion> {
    const response = await this.client(params.apiKey).chat.completions.create({
      model: params.model,
      messages: this.buildMessages(params),
      max_tokens: params.maxOutputTokens,
    });

    return {
      text: response.choices[0]?.message?.content ?? '',
      modelUsed: params.model,
      provider: this.name,
    };
  }

  async *stream(params: GenerateParams): AsyncIterable<string> {
    const stream = await this.client(params.apiKey).chat.completions.create({
      model: params.model,
      messages: this.buildMessages(params),
      max_tokens: params.maxOutputTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  private buildMessages(
    params: GenerateParams,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (params.context) {
      messages.push({ role: 'system', content: params.context });
    }

    if (params.imageUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: params.prompt },
          { type: 'image_url', image_url: { url: params.imageUrl } },
        ],
      });
      return messages;
    }

    messages.push({ role: 'user', content: params.prompt });
    return messages;
  }

  private resolveKey(apiKey?: string): string | undefined {
    return apiKey ?? this.configService.get<string>('OPENAI_API_KEY');
  }

  private client(apiKey?: string): OpenAI {
    // Built per call so a user's own key is never cached onto a shared client.
    return new OpenAI({ apiKey: this.resolveKey(apiKey) });
  }
}
