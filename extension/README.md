# Nutch extension

The Chrome extension: the sidebar users actually see. The API it talks to lives
in the parent directory.

## Running it

```bash
npm install
npm run build          # or: npm run dev  (rebuilds on change)
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select `extension/dist`

The API must be running (`npm run start:dev` in the parent directory) and must
allow the extension's origin:

```
CORS_ORIGIN="http://localhost:3100,chrome-extension://*"
```

`npm run dev` rebuilds on change, but Chrome does not reload an unpacked
extension by itself — press the reload button on the extension card. Changes to
the side panel appear on reopening it; changes to the service worker need the
reload.

## Commands

| | |
| --- | --- |
| `npm run build` | Build to `dist/` |
| `npm run dev` | Build and watch |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run gen:api` | Regenerate API types from the running server |

## How it is put together

```
src/
  background/   Service worker: menus, shortcut, injection, panel opening
  content/      Injected on demand to read the selection, then exits
  sidepanel/    The React UI
  api/          Typed client, SSE parser, error model
  shared/       Message contract and storage wrapper
```

Three artefacts with three different requirements, which is why
`scripts/build.mjs` drives Vite's API instead of using one config:

| Output | Format | Why |
| --- | --- | --- |
| `sidepanel.html` | HTML + module | A normal page |
| `background.js` | ES module | MV3 workers support `"type": "module"` |
| `content.js` | IIFE | `chrome.scripting.executeScript` cannot inject a module |

### Decisions worth keeping

**No static content script.** `activeTab` plus `scripting` means the content
script is injected only when the user invokes Nutch. A `content_scripts` entry
matching `<all_urls>` would make installing ask to read every website, which is
a common reason for store review to reject an extension.

**Nothing lives in the service worker's memory.** MV3 tears it down when idle,
so listeners are registered at module scope and state goes to `chrome.storage`.
A selection captured before the panel finishes opening is stored rather than
sent, because a message with no receiver is dropped silently.

**The API contract is generated, not copied.** `npm run gen:api` regenerates
`src/api/schema.gen.ts` from the OpenAPI document the server publishes, so the
two sides cannot drift apart unnoticed.

**SSE is parsed from a fetch body, not `EventSource`.** `EventSource` only makes
GET requests and cannot send an `Authorization` header. That means framing is
handled here, and chunk boundaries are arbitrary — `SseParser` buffers across
reads, because parsing chunk-by-chunk drops events under load.

## State

The scaffold is complete: the panel opens, creates an anonymous session, lists
models from the API, and receives the current page selection.

The UI is deliberately unstyled — the visual design lands on top of this without
changing any of the plumbing. Selection capture, the prompt editor, response
rendering, history and file management are still to come.
