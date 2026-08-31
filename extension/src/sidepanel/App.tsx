import { useEffect, useState } from 'react';
import type { PageSelection } from '../shared/messages';
import { isExtensionMessage, sendMessage } from '../shared/messages';
import type { ModelSummary } from '../api/client';
import { createClient, ensureSession } from './session';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; models: ModelSummary[]; anonymous: boolean }
  | { kind: 'error'; message: string };

/**
 * Placeholder shell. It proves the wiring end to end — panel opens, session is
 * created, the API answers, a selection arrives — and is deliberately unstyled:
 * the visual design lands on top of this without changing the plumbing.
 */
export function App() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [selection, setSelection] = useState<PageSelection | undefined>();

  useEffect(() => {
    const client = createClient();

    void (async () => {
      try {
        await ensureSession(client);
        const [models, profile] = await Promise.all([
          client.listModels(),
          client.getProfile(),
        ]);
        setStatus({ kind: 'ready', models, anonymous: profile.isAnonymous });
      } catch (error) {
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not reach the API',
        });
      }
    })();

    // Ask the worker for anything captured before this panel mounted.
    void sendMessage({ type: 'panel:ready' }).then((reply) => {
      if (isExtensionMessage(reply) && reply.type === 'selection:deliver') {
        setSelection(reply.selection);
      }
    });
  }, []);

  return (
    <main>
      <h1>Nutch</h1>

      {status.kind === 'loading' && <p>Connecting…</p>}

      {status.kind === 'error' && (
        <p role="alert">
          {status.message}. Is the API running on port 3100?
        </p>
      )}

      {status.kind === 'ready' && (
        <section>
          <p>
            Signed in as {status.anonymous ? 'an anonymous user' : 'yourself'}.
          </p>
          <ul>
            {status.models.map((model) => (
              <li key={model.id}>
                {model.label} — {model.source} key
                {!model.available && ' (unavailable)'}
                {model.locked && ' (sign in to use)'}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Selection</h2>
        {selection ? (
          <figure>
            <blockquote>{selection.text || '(no text selected)'}</blockquote>
            <figcaption>{selection.page.title}</figcaption>
            {selection.code?.language && <p>Code: {selection.code.language}</p>}
            {selection.imageUrl && <p>Image: {selection.imageUrl}</p>}
          </figure>
        ) : (
          <p>Highlight something on a page, then open Nutch.</p>
        )}
      </section>
    </main>
  );
}
