/**
 * Typed wrapper over chrome.storage.local.
 *
 * The service worker cannot hold state in memory, so anything that must survive
 * — the session token, the pending selection, recent history — lives here.
 * Every read tolerates a missing or malformed value rather than throwing.
 */

export interface StoredSession {
  accessToken: string;
  /** Absent for anonymous sessions. */
  email?: string;
  userId: string;
}

interface StorageShape {
  session: StoredSession;
  /** Selection captured before the panel finished opening. */
  pendingSelection: unknown;
  lastSessionId: string;
}

export async function get<K extends keyof StorageShape>(
  key: K,
): Promise<StorageShape[K] | undefined> {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] as StorageShape[K] | undefined;
  } catch {
    // Storage can be unavailable in a torn-down worker; callers treat this as
    // "nothing stored" rather than a failure.
    return undefined;
  }
}

export async function set<K extends keyof StorageShape>(
  key: K,
  value: StorageShape[K],
): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    // Best effort: losing a cached value is recoverable, crashing is not.
  }
}

export async function remove(key: keyof StorageShape): Promise<void> {
  try {
    await chrome.storage.local.remove(key);
  } catch {
    /* see above */
  }
}
