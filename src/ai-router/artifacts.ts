/**
 * Pulls saveable artifacts out of a model response.
 *
 * The PRD wants generated code and documents filed automatically, so fenced
 * code blocks become files. Prose is left alone: saving every answer would
 * bury the genuinely useful outputs.
 */

export interface ExtractedArtifact {
  filename: string;
  content: string;
  fileType: string;
}

/** Fence language -> file extension. Unlisted languages keep their own name. */
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  python: 'py',
  py: 'py',
  java: 'java',
  'c++': 'cpp',
  cpp: 'cpp',
  c: 'c',
  csharp: 'cs',
  cs: 'cs',
  go: 'go',
  golang: 'go',
  ruby: 'rb',
  rb: 'rb',
  rust: 'rs',
  rs: 'rs',
  php: 'php',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yml',
  yml: 'yml',
  xml: 'xml',
  markdown: 'md',
  md: 'md',
};

const FENCE = /```([A-Za-z0-9+#._-]*)\r?\n([\s\S]*?)```/g;

/** Shortest block worth keeping; below this it is a snippet, not a file. */
const MIN_CONTENT_LENGTH = 24;

export function extensionForLanguage(language: string): string {
  const key = language.trim().toLowerCase();
  if (!key) return 'txt';
  return LANGUAGE_EXTENSIONS[key] ?? key;
}

export function extractArtifacts(
  response: string,
  namePrefix = 'output',
): ExtractedArtifact[] {
  const artifacts: ExtractedArtifact[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  FENCE.lastIndex = 0;
  while ((match = FENCE.exec(response)) !== null) {
    const content = match[2].trim();
    if (content.length < MIN_CONTENT_LENGTH) continue;

    const fileType = extensionForLanguage(match[1]);
    index += 1;
    artifacts.push({
      filename: `${namePrefix}-${index}.${fileType}`,
      content,
      fileType,
    });
  }

  return artifacts;
}

/** Filesystem-safe slug derived from the prompt, used to name saved files. */
export function slugForPrompt(prompt: string, maxLength = 40): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

  return slug || 'output';
}
