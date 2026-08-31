import { ModelCapabilities } from './providers/model-registry';

/**
 * Smart redirection (functional requirement 8).
 *
 * Chat models cannot generate images, video or audio. Rather than answering
 * "I can't do that", Nutch names the tool that can and hands over the prompt
 * so the user does not retype it.
 *
 * Rules are matched against the prompt because the request carries no task
 * type; `input_type` describes what was selected on the page, not what the
 * user wants done with it.
 */

export interface RedirectRule {
  /** Capability a model would need for Nutch to handle this itself. */
  requires: keyof ModelCapabilities;
  tool: string;
  url: string;
  reason: string;
  match: RegExp;
  /** Phrases stripped from the prompt so the handoff reads naturally. */
  strip: RegExp;
}

export interface RedirectDecision {
  redirect: true;
  tool: string;
  url: string;
  reason: string;
  pre_fill: string;
}

const IMAGE_VERBS =
  /\b(generate|create|make|draw|paint|render|design|illustrate|produce)\b/i;
const IMAGE_NOUNS =
  /\b(image|picture|photo|illustration|artwork|art|logo|poster|drawing|painting|render|wallpaper|icon)\b/i;

export const REDIRECT_RULES: RedirectRule[] = [
  {
    requires: 'imageGeneration',
    tool: 'Midjourney',
    url: 'https://www.midjourney.com/imagine',
    reason:
      'Chat models can describe and analyse images but cannot generate them.',
    // Both halves must be present, so "explain this image" does not match
    // while "draw me an image of a fox" does.
    match: new RegExp(
      `(?=.*${IMAGE_VERBS.source})(?=.*${IMAGE_NOUNS.source})`,
      'i',
    ),
    strip:
      /^\s*(please\s+)?(can you\s+|could you\s+|i want you to\s+|i'?d like you to\s+)?(generate|create|make|draw|paint|render|design|illustrate|produce)\s+(me\s+)?(an?\s+|some\s+)?(image|picture|photo|illustration|artwork|art|drawing|painting|render)?\s*(of|showing|depicting|that shows)?\s*/i,
  },
  {
    requires: 'imageGeneration',
    tool: 'Runway',
    url: 'https://runwayml.com',
    reason: 'Chat models cannot generate video.',
    match:
      /\b(generate|create|make|render|produce|animate)\b.*\b(video|animation|clip|movie|film)\b/i,
    strip:
      /^\s*(please\s+)?(generate|create|make|render|produce|animate)\s+(me\s+)?(an?\s+|some\s+)?(video|animation|clip|movie|film)?\s*(of|showing|depicting)?\s*/i,
  },
];

/** Trailing punctuation left behind once the instruction phrasing is removed. */
const TRAILING = /[\s.,:;!?]+$/;

export function buildPreFill(prompt: string, rule: RedirectRule): string {
  const stripped = prompt.replace(rule.strip, '').replace(TRAILING, '').trim();
  // If stripping consumed everything, the original prompt is the better handoff.
  return stripped.length > 0 ? stripped : prompt.trim();
}

/**
 * Returns a redirect when the request needs a capability no available model
 * has. `capabilities` is the selected model's, so a future image-capable model
 * would simply handle the request instead.
 */
export function findRedirect(
  prompt: string,
  capabilities: ModelCapabilities,
): RedirectDecision | undefined {
  for (const rule of REDIRECT_RULES) {
    if (capabilities[rule.requires]) continue;
    if (!rule.match.test(prompt)) continue;

    return {
      redirect: true,
      tool: rule.tool,
      url: rule.url,
      reason: rule.reason,
      pre_fill: buildPreFill(prompt, rule),
    };
  }

  return undefined;
}
