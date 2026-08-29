import {
  DEFAULT_MODEL_ID,
  MODELS,
  findModel,
  listModels,
  modelsForProvider,
} from './model-registry';

describe('model registry', () => {
  it('resolves a known model', () => {
    expect(findModel('claude-opus-5')?.provider).toBe('anthropic');
    expect(findModel('gpt-4o')?.provider).toBe('openai');
  });

  it('returns undefined for an unknown model rather than throwing', () => {
    expect(findModel('gpt-9-ultra')).toBeUndefined();
  });

  it('has a default model that exists in the registry', () => {
    expect(findModel(DEFAULT_MODEL_ID)).toBeDefined();
  });

  it('uses unique ids', () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every model a positive output cap', () => {
    for (const model of MODELS) {
      expect(model.maxOutputTokens).toBeGreaterThan(0);
    }
  });

  it('marks no chat model as capable of generating images', () => {
    // This is what makes smart redirection to an image tool necessary.
    expect(MODELS.every((m) => !m.capabilities.imageGeneration)).toBe(true);
  });

  it('filters by provider', () => {
    expect(
      modelsForProvider('anthropic').every((m) => m.provider === 'anthropic'),
    ).toBe(true);
    expect(modelsForProvider('openai').length).toBeGreaterThan(0);
  });

  it('returns a copy so callers cannot mutate the registry', () => {
    listModels().push({} as never);
    expect(listModels().length).toBe(MODELS.length);
  });
});
