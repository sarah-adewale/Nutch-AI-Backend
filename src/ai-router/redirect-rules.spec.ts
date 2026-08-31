import { buildPreFill, findRedirect, REDIRECT_RULES } from './redirect-rules';

const chatModel = { streaming: true, vision: true, imageGeneration: false };
const imageModel = { streaming: true, vision: true, imageGeneration: true };

describe('findRedirect', () => {
  describe('image generation', () => {
    it.each([
      'Generate an image of a fox in a forest',
      'draw me a picture of the Lagos skyline',
      'Can you create a logo for a coffee shop?',
      'Please make an illustration of a robot',
      'render artwork showing a sunset',
    ])('redirects: %s', (prompt) => {
      expect(findRedirect(prompt, chatModel)?.tool).toBe('Midjourney');
    });

    it.each([
      'Explain this image',
      'What is in this picture?',
      'Describe the artwork on this page',
      'Summarise this article',
      'Write a function to resize an image',
      'How do I create a React component?',
    ])('does not redirect: %s', (prompt) => {
      expect(findRedirect(prompt, chatModel)).toBeUndefined();
    });
  });

  describe('video generation', () => {
    it('redirects a video request', () => {
      expect(
        findRedirect('Create a video of waves crashing', chatModel)?.tool,
      ).toBe('Runway');
    });

    it('does not redirect a question about video', () => {
      expect(
        findRedirect('How does video compression work?', chatModel),
      ).toBeUndefined();
    });
  });

  it('does not redirect when the model has the capability', () => {
    // A future image-capable model should handle the request itself rather
    // than being sent away.
    expect(
      findRedirect('Generate an image of a fox', imageModel),
    ).toBeUndefined();
  });

  it('carries a reason and a destination', () => {
    const decision = findRedirect('Draw a picture of a cat', chatModel)!;

    expect(decision.redirect).toBe(true);
    expect(decision.url).toContain('midjourney');
    expect(decision.reason).toMatch(/cannot generate/i);
  });
});

describe('buildPreFill', () => {
  const imageRule = REDIRECT_RULES[0];

  it('strips the instruction and keeps the subject', () => {
    expect(
      buildPreFill('Generate an image of a fox in a forest', imageRule),
    ).toBe('a fox in a forest');
  });

  it('handles a polite request', () => {
    expect(
      buildPreFill('Please create a picture of the Lagos skyline', imageRule),
    ).toBe('the Lagos skyline');
  });

  it('removes trailing punctuation', () => {
    expect(buildPreFill('Draw me an image of a robot!', imageRule)).toBe(
      'a robot',
    );
  });

  it('falls back to the whole prompt when stripping leaves nothing', () => {
    // Otherwise the handoff would arrive empty.
    expect(buildPreFill('Generate an image', imageRule)).toBe(
      'Generate an image',
    );
  });

  it('leaves an unmatched prompt intact', () => {
    expect(buildPreFill('a fox wearing a hat', imageRule)).toBe(
      'a fox wearing a hat',
    );
  });
});
