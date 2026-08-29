import { ProviderName } from './ai-provider.interface';

export interface ModelCapabilities {
  streaming: boolean;
  /** Can accept an image alongside the prompt. */
  vision: boolean;
  /** Can produce images. No chat model can; this drives smart redirection. */
  imageGeneration: boolean;
}

export interface ModelDefinition {
  id: string;
  provider: ProviderName;
  label: string;
  capabilities: ModelCapabilities;
  maxOutputTokens: number;
}

const chat = (streaming = true, vision = true): ModelCapabilities => ({
  streaming,
  vision,
  imageGeneration: false,
});

/**
 * The single place a model is described. Routing, capability checks and the
 * model switcher in the extension all read from here, so adding a model is a
 * data change rather than a code change.
 */
export const MODELS: ModelDefinition[] = [
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    label: 'Claude Opus 5',
    capabilities: chat(),
    maxOutputTokens: 8192,
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5',
    capabilities: chat(),
    maxOutputTokens: 8192,
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5',
    capabilities: chat(),
    maxOutputTokens: 8192,
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    label: 'GPT-4o',
    capabilities: chat(),
    maxOutputTokens: 4096,
  },
  {
    id: 'gpt-4',
    provider: 'openai',
    label: 'GPT-4',
    capabilities: chat(true, false),
    maxOutputTokens: 4096,
  },
];

export const DEFAULT_MODEL_ID = 'claude-opus-5';

export function findModel(id: string): ModelDefinition | undefined {
  return MODELS.find((model) => model.id === id);
}

export function listModels(): ModelDefinition[] {
  return [...MODELS];
}

export function modelsForProvider(provider: ProviderName): ModelDefinition[] {
  return MODELS.filter((model) => model.provider === provider);
}
