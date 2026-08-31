import { NutchClient } from '../api/client';
import * as storage from '../shared/storage';

/**
 * Resolves a usable session, creating an anonymous one on first run.
 *
 * The PRD is explicit that nothing is gated behind login up front, so the panel
 * must work before the user has done anything.
 */
export async function ensureSession(client: NutchClient): Promise<storage.StoredSession> {
  const existing = await storage.get('session');
  if (existing?.accessToken) return existing;

  const created = await client.createAnonymousSession();
  const session: storage.StoredSession = {
    accessToken: created.access_token,
    userId: created.user.id,
  };
  await storage.set('session', session);
  return session;
}

export function createClient(): NutchClient {
  return new NutchClient({
    getToken: async () => (await storage.get('session'))?.accessToken,
    onUnauthorized: async () => {
      // The stored token is gone or expired; drop it so the next call starts a
      // fresh anonymous session rather than looping on 401.
      await storage.remove('session');
    },
  });
}
