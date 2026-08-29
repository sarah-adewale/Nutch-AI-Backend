/**
 * `.env.example` ships placeholder keys ("your-openai-api-key"). Treating one
 * as a real key makes the model switcher advertise models that cannot answer,
 * so a placeholder counts as no key at all.
 */
export function isUsableApiKey(key: string | undefined): boolean {
  if (!key) return false;

  const trimmed = key.trim();
  if (trimmed.length === 0) return false;

  return !/^your-/i.test(trimmed);
}
