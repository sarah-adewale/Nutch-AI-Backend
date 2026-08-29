import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  AiCompletion,
  AiProvider,
  GenerateParams,
  ProviderName,
} from './ai-provider.interface';
import { isUsableApiKey } from './api-key';

@Injectable()
export class AnthropicService implements AiProvider {
  readonly name: ProviderName = 'anthropic';

  constructor(private configService: ConfigService) {}

  isConfigured(apiKey?: string): boolean {
    return isUsableApiKey(this.resolveKey(apiKey));
  }

  async generate(params: GenerateParams): Promise<AiCompletion> {
    const response = await this.client(params.apiKey).messages.create({
      model: params.model,
      max_tokens: params.maxOutputTokens,
      ...(params.context ? { system: params.context } : {}),
      messages: [{ role: 'user', content: this.buildContent(params) }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return { text, modelUsed: params.model, provider: this.name };
  }

  async *stream(params: GenerateParams): AsyncIterable<string> {
    const stream = this.client(params.apiKey).messages.stream({
      model: params.model,
      max_tokens: params.maxOutputTokens,
      ...(params.context ? { system: params.context } : {}),
      messages: [{ role: 'user', content: this.buildContent(params) }],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }

  private buildContent(
    params: GenerateParams,
  ): Anthropic.ContentBlockParam[] | string {
    if (!params.imageUrl) return params.prompt;

    return [
      { type: 'image', source: { type: 'url', url: params.imageUrl } },
      { type: 'text', text: params.prompt },
    ];
  }

  private resolveKey(apiKey?: string): string | undefined {
    return apiKey ?? this.configService.get<string>('ANTHROPIC_API_KEY');
  }

  private client(apiKey?: string): Anthropic {
    // Built per call so a user's own key is never cached onto a shared client.
    return new Anthropic({ apiKey: this.resolveKey(apiKey) });
  }
}
