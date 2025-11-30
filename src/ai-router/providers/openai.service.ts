import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAiService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async generateResponse(prompt: string, model: string = 'gpt-4') {
    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
      });

      return {
        response:
          response.choices[0]?.message?.content || 'No response generated',
        model_used: model,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async generateWithContext(
    prompt: string,
    context: string,
    model: string = 'gpt-4',
  ) {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: context },
      { role: 'user', content: prompt },
    ];

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages,
        max_tokens: 1500,
      });

      return {
        response:
          response.choices[0]?.message?.content || 'No response generated',
        model_used: model,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}
