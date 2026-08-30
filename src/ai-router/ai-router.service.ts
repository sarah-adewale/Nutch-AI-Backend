import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { FilesService } from '../files/files.service';
import { LimitExceededException } from '../limits/limit-exceeded.exception';
import { extractArtifacts, slugForPrompt } from './artifacts';
import { PromptRequestDto } from './dto/prompt-request.dto';
import { AiResponseDto } from './dto/ai-response.dto';
import { AnthropicService } from './providers/anthropic.service';
import { OpenAiService } from './providers/openai.service';
import {
  AiProvider,
  GenerateParams,
  ProviderName,
} from './providers/ai-provider.interface';
import {
  DEFAULT_MODEL_ID,
  ModelDefinition,
  findModel,
  listModels,
} from './providers/model-registry';

/** How much of the first prompt becomes the session title in the history list. */
const TITLE_MAX_LENGTH = 60;

interface ResolvedRequest {
  definition: ModelDefinition;
  provider: AiProvider;
  params: GenerateParams;
}

@Injectable()
export class AiRouterService {
  private readonly providers: Record<ProviderName, AiProvider>;

  constructor(
    openai: OpenAiService,
    anthropic: AnthropicService,
    private chatService: ChatService,
    private filesService: FilesService,
  ) {
    this.providers = { openai, anthropic };
  }

  listAvailableModels() {
    return listModels().map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      capabilities: model.capabilities,
      // Until BYOK lands every model runs on the Nutch key. Functional
      // requirement 7 wants this labelled in the UI, so it is sent explicitly
      // rather than inferred by the extension.
      source: 'nutch' as const,
      available: this.providers[model.provider].isConfigured(),
    }));
  }

  async processPrompt(
    request: PromptRequestDto,
    userId: string,
  ): Promise<
    AiResponseDto & {
      session_id: string;
      files: Array<{
        id: string;
        filename: string;
        folder: string;
        fileType: string;
      }>;
      storage_limit_reached: boolean;
    }
  > {
    const resolved = this.resolve(request);
    const sessionId = await this.resolveSession(request, userId, resolved);

    await this.recordUserMessage(sessionId, request, resolved);

    const completion = await resolved.provider.generate(resolved.params);

    await this.chatService.addMessage(
      sessionId,
      'assistant',
      completion.text,
      undefined,
      undefined,
      completion.modelUsed,
    );

    const saved = await this.saveArtifacts(
      userId,
      request.prompt,
      completion.text,
    );

    return {
      response: completion.text,
      model_used: completion.modelUsed,
      timestamp: new Date().toISOString(),
      file_type: saved.files[0]?.fileType ?? 'txt',
      folder: saved.files[0]?.folder ?? '/documents',
      session_id: sessionId,
      files: saved.files,
      storage_limit_reached: saved.limitReached,
    };
  }

  /**
   * Files any code blocks the answer produced. Saving is best effort: the
   * completion has already been paid for, so hitting the storage cap returns
   * the answer with a flag rather than failing the whole request.
   */
  private async saveArtifacts(
    userId: string,
    prompt: string,
    response: string,
  ) {
    const artifacts = extractArtifacts(response, slugForPrompt(prompt));
    const files: Array<{
      id: string;
      filename: string;
      folder: string;
      fileType: string;
    }> = [];
    let limitReached = false;

    for (const artifact of artifacts) {
      try {
        const file = await this.filesService.createFile(
          userId,
          artifact.filename,
          artifact.content,
          artifact.fileType,
        );
        files.push({
          id: file.id,
          filename: file.filename,
          folder: file.folder,
          fileType: file.fileType,
        });
      } catch (error) {
        if (error instanceof LimitExceededException) {
          limitReached = true;
          break;
        }
        throw error;
      }
    }

    return { files, limitReached };
  }

  /**
   * Streams deltas to the caller and persists the assembled reply once the
   * stream finishes, so a completed answer is in history exactly once.
   */
  async *streamPrompt(
    request: PromptRequestDto,
    userId: string,
  ): AsyncGenerator<
    { type: 'session'; sessionId: string } | { type: 'delta'; text: string },
    void
  > {
    const resolved = this.resolve(request);
    const sessionId = await this.resolveSession(request, userId, resolved);

    await this.recordUserMessage(sessionId, request, resolved);
    yield { type: 'session', sessionId };

    let assembled = '';
    try {
      for await (const delta of resolved.provider.stream(resolved.params)) {
        assembled += delta;
        yield { type: 'delta', text: delta };
      }
    } finally {
      // Persist whatever arrived, so an interrupted answer is not lost.
      if (assembled.length > 0) {
        await this.chatService.addMessage(
          sessionId,
          'assistant',
          assembled,
          undefined,
          undefined,
          resolved.definition.id,
        );
      }
    }
  }

  private resolve(request: PromptRequestDto): ResolvedRequest {
    const modelId = request.model || DEFAULT_MODEL_ID;
    const definition = findModel(modelId);

    if (!definition) {
      throw new BadRequestException(
        `Unknown model "${modelId}". Call GET /ai/models for the supported list.`,
      );
    }

    // Validate the request itself before checking keys: a malformed request is
    // a 400 whether or not a provider happens to be configured.
    if (request.input_type === 'image' && !request.image_url) {
      throw new BadRequestException(
        'image_url is required when input_type is "image".',
      );
    }

    if (request.image_url && !definition.capabilities.vision) {
      throw new BadRequestException(
        `${definition.label} cannot read images. Choose a model with vision support.`,
      );
    }

    const provider = this.providers[definition.provider];

    if (!provider.isConfigured()) {
      throw new ServiceUnavailableException(
        `No API key is configured for ${definition.provider}, so ${definition.label} cannot be used right now.`,
      );
    }

    return {
      definition,
      provider,
      params: {
        model: definition.id,
        prompt: request.prompt,
        context: request.context,
        imageUrl: request.image_url,
        maxOutputTokens: definition.maxOutputTokens,
      },
    };
  }

  private async resolveSession(
    request: PromptRequestDto,
    userId: string,
    resolved: ResolvedRequest,
  ): Promise<string> {
    if (request.session_id) {
      const existing = await this.chatService.getChatSession(
        request.session_id,
        userId,
      );

      if (!existing) {
        throw new BadRequestException('Chat session not found');
      }

      return existing.id;
    }

    const created = await this.chatService.createChatSession(
      userId,
      resolved.definition.id,
      this.deriveTitle(request.prompt),
    );

    return created.id;
  }

  private recordUserMessage(
    sessionId: string,
    request: PromptRequestDto,
    resolved: ResolvedRequest,
  ) {
    return this.chatService.addMessage(
      sessionId,
      'user',
      request.prompt,
      request.input_type,
      request.context,
      resolved.definition.id,
    );
  }

  private deriveTitle(prompt: string): string {
    const flattened = prompt.replace(/\s+/g, ' ').trim();
    return flattened.length > TITLE_MAX_LENGTH
      ? `${flattened.slice(0, TITLE_MAX_LENGTH - 1)}…`
      : flattened;
  }
}
