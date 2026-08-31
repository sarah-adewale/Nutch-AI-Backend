import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { FilesService } from '../files/files.service';
import { ByokService } from '../byok/byok.service';
import { UsersService } from '../users/users.service';
import { UsageService } from '../limits/usage.service';
import { LimitExceededException } from '../limits/limit-exceeded.exception';
import { extractArtifacts, slugForPrompt } from './artifacts';
import { RedirectDecision, findRedirect } from './redirect-rules';
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
  ProviderException,
  classifyProviderError,
  safeDetail,
} from './providers/provider-error';
import {
  DEFAULT_MODEL_ID,
  ModelDefinition,
  findModel,
  listModels,
} from './providers/model-registry';

/** How much of the first prompt becomes the session title in the history list. */
const TITLE_MAX_LENGTH = 60;

type KeySource = 'nutch' | 'user';

interface ResolvedRequest {
  definition: ModelDefinition;
  provider: AiProvider;
  params: GenerateParams;
  keySource: KeySource;
  isAnonymous: boolean;
}

@Injectable()
export class AiRouterService {
  private readonly providers: Record<ProviderName, AiProvider>;

  constructor(
    openai: OpenAiService,
    anthropic: AnthropicService,
    private chatService: ChatService,
    private filesService: FilesService,
    private byokService: ByokService,
    private usersService: UsersService,
    private usageService: UsageService,
  ) {
    this.providers = { openai, anthropic };
  }

  /**
   * The switcher's data. Availability and key source are per user, because a
   * connected key can make a model usable that the Nutch key cannot reach.
   */
  async listAvailableModels(userId: string) {
    const isAnonymous = await this.usersService.isAnonymous(userId);
    const withKeys = isAnonymous
      ? new Set<string>()
      : await this.byokService.providersWithKeys(userId);

    return listModels().map((model) => {
      const usesOwnKey = withKeys.has(model.provider);

      return {
        id: model.id,
        label: model.label,
        provider: model.provider,
        capabilities: model.capabilities,
        // Functional requirement 7: models are labelled Nutch-provided or
        // user-owned rather than leaving the extension to infer it.
        source: usesOwnKey ? ('user' as const) : ('nutch' as const),
        available: usesOwnKey || this.providers[model.provider].isConfigured(),
        // Anonymous sessions have no model switching, so everything but the
        // default is shown as locked rather than hidden.
        locked: isAnonymous && model.id !== DEFAULT_MODEL_ID,
      };
    });
  }

  async processPrompt(
    request: PromptRequestDto,
    userId: string,
  ): Promise<
    | RedirectDecision
    | (AiResponseDto & {
        session_id: string;
        key_source: KeySource;
        files: Array<{
          id: string;
          filename: string;
          folder: string;
          fileType: string;
        }>;
        storage_limit_reached: boolean;
      })
  > {
    const resolved = await this.resolve(request, userId);

    // Checked before any session is created: a redirect produces no answer, and
    // an anonymous user only gets three sessions.
    const redirect = findRedirect(
      request.prompt,
      resolved.definition.capabilities,
    );
    if (redirect) return redirect;

    // Only prompts served on the shared key count against the daily quota.
    if (resolved.keySource === 'nutch') {
      this.usageService.consume(userId, resolved.isAnonymous);
    }

    const sessionId = await this.resolveSession(request, userId, resolved);

    await this.recordUserMessage(sessionId, request, resolved);

    const completion = await this.callProvider(resolved, () =>
      resolved.provider.generate(resolved.params),
    );

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
      // Functional requirement 7: the sidebar must show whether an answer ran
      // on Nutch's key or the user's own.
      key_source: resolved.keySource,
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
    | { type: 'session'; sessionId: string }
    | { type: 'delta'; text: string }
    | { type: 'redirect'; redirect: RedirectDecision },
    void
  > {
    const resolved = await this.resolve(request, userId);

    const redirect = findRedirect(
      request.prompt,
      resolved.definition.capabilities,
    );
    if (redirect) {
      yield { type: 'redirect', redirect };
      return;
    }

    if (resolved.keySource === 'nutch') {
      this.usageService.consume(userId, resolved.isAnonymous);
    }

    const sessionId = await this.resolveSession(request, userId, resolved);

    await this.recordUserMessage(sessionId, request, resolved);
    yield { type: 'session', sessionId };

    let assembled = '';
    try {
      const stream = resolved.provider.stream(resolved.params);
      const iterator = stream[Symbol.asyncIterator]();

      while (true) {
        const next = await this.callProvider(resolved, () => iterator.next());
        if (next.done) break;
        assembled += next.value;
        yield { type: 'delta', text: next.value };
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

  /**
   * Turns a provider SDK failure into an actionable status. Without this an
   * unfunded key, a rate limit and a genuine outage all reach the extension as
   * an indistinguishable 500.
   */
  private async callProvider<T>(
    resolved: ResolvedRequest,
    call: () => Promise<T>,
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      const failure = classifyProviderError(error);
      throw new ProviderException(
        resolved.definition.provider,
        failure,
        safeDetail(error, failure),
        resolved.keySource,
      );
    }
  }

  private async resolve(
    request: PromptRequestDto,
    userId: string,
  ): Promise<ResolvedRequest> {
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

    const isAnonymous = await this.usersService.isAnonymous(userId);

    // The PRD gives anonymous users neither model switching nor BYOK.
    if (isAnonymous && definition.id !== DEFAULT_MODEL_ID) {
      throw new ForbiddenException(
        'Sign in to switch models. Anonymous sessions use the default model.',
      );
    }

    const userKey = isAnonymous
      ? undefined
      : await this.byokService.decryptFor(userId, definition.provider);

    const provider = this.providers[definition.provider];

    if (!provider.isConfigured(userKey)) {
      throw new ServiceUnavailableException(
        `No API key is configured for ${definition.provider}, so ${definition.label} cannot be used right now.`,
      );
    }

    return {
      definition,
      provider,
      keySource: userKey ? 'user' : 'nutch',
      isAnonymous,
      params: {
        model: definition.id,
        prompt: request.prompt,
        context: request.context,
        imageUrl: request.image_url,
        maxOutputTokens: definition.maxOutputTokens,
        apiKey: userKey,
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
