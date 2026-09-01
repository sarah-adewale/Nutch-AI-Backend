import { Module } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { AnthropicService } from './anthropic.service';

/**
 * The provider services alone. BYOK needs them to validate a key and the
 * router needs them to answer prompts; giving them their own module keeps
 * those two from importing each other.
 */
@Module({
  providers: [OpenAiService, AnthropicService],
  exports: [OpenAiService, AnthropicService],
})
export class ProvidersModule {}
