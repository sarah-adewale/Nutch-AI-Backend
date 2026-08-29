export type ProviderName = 'openai' | 'anthropic';

export interface GenerateParams {
  /** Provider-native model id, already resolved through the registry. */
  model: string;
  prompt: string;
  /** Optional system instruction, taken from the request's `context` field. */
  context?: string;
  /** Set when the user selected an image on the page. */
  imageUrl?: string;
  maxOutputTokens: number;
  /**
   * A user's own key, when they have connected one. Providers fall back to the
   * Nutch key when this is absent, which is what keeps BYOK from changing the
   * routing shape when it lands.
   */
  apiKey?: string;
}

export interface AiCompletion {
  text: string;
  modelUsed: string;
  provider: ProviderName;
}

export interface AiProvider {
  readonly name: ProviderName;

  /** False when no key is available, so the router can answer 503 rather than fail mid-call. */
  isConfigured(apiKey?: string): boolean;

  generate(params: GenerateParams): Promise<AiCompletion>;

  /** Yields text deltas as they arrive. */
  stream(params: GenerateParams): AsyncIterable<string>;
}
