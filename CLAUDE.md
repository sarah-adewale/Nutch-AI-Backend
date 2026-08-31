# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

Nutch is a browser-native AI assistant: a Chrome extension plus the API behind it. **This repository holds both.**

```
src/          NestJS API
extension/    Chrome extension (MV3)
prisma/       Schema and migrations
docs/         ADRs and deployment
test/         API end-to-end tests
```

They share one repository because they share one contract — error codes, response fields and SSE event names are defined by the API and consumed by the extension. They are otherwise independent: separate `package.json`, separate builds, separate test runs, and only `src/` ships in the API's Docker image.

**Work on one side at a time.** A change that spans both (new field, new error code) is one commit, but do not let extension work drift into backend refactors or the reverse.

## Ground rules

- Run commands from the directory that owns them. API commands at the root; extension commands inside `extension/`.
- The API's `npm test` and `npm run lint` do **not** cover `extension/`, by design. Run the extension's own scripts for that side.
- Do not delete `dist/` while a dev server is running — the watcher is running out of it and will thrash with `EADDRINUSE`.
- `.env` is gitignored and holds real secrets. `.env.example` holds placeholders and is committed. Never move a real value into the example.

---

## The API

### Modules

| Path | Responsibility |
| --- | --- |
| `src/auth/` | OAuth (Google, GitHub), anonymous sessions, magic-link sign-in, anonymous→account migration |
| `src/ai-router/` | Model registry, provider routing, streaming, smart redirection, artifact extraction |
| `src/ai-router/providers/` | `AiProvider` implementations, error classification |
| `src/byok/` | User-supplied API keys: validate, encrypt, route through |
| `src/chat/` | Sessions, messages, cursor-paginated history, search |
| `src/files/` | Auto-foldering, S3 offload, encrypted bodies, download |
| `src/limits/` | Storage caps and the daily prompt quota |
| `src/encryption/` | AES-256-GCM for keys and file bodies |
| `src/common/` | Exception filter, CORS matcher, config validation |
| `src/health/` | Readiness probe |

### Design decisions worth preserving

**The model registry is the single source of truth.** `providers/model-registry.ts` holds each model's provider, capabilities and output cap. Routing, capability checks, the model switcher and smart redirection all read from it. Adding a model is a data change — do not add model-specific branching elsewhere.

**Provider clients are built per call, not per instance.** A user's BYOK key must never be cached onto a client shared with other users.

**Streaming is synchronous SSE, not a queue.** BullMQ was removed deliberately: a queue cannot stream tokens and adds latency to the headline sub-2s requirement.

**Limits are enforced in services, not controllers.** `LimitsService` is consulted before any create, so no path can bypass a cap. The profile endpoint reads its numbers from the same service, so reported and enforced limits cannot drift.

**Errors are structured.** Anything thrown becomes a consistent JSON body via `AllExceptionsFilter`, which preserves extra fields on richer exceptions. Clients branch on `error`, not on prose.

**Encryption is layered deliberately.** BYOK keys and file bodies are encrypted in the application; message content is not, because it must remain searchable. See `docs/adr-001-encryption-at-rest.md` before changing this — the two requirements genuinely conflict.

### Commands

```bash
npm run start:dev        # dev server, port 3100
npm run build
npm test                 # unit
npm run test:e2e         # needs a database
npm run lint
npx prisma migrate dev   # create a migration
npx prisma studio
```

Swagger: <http://localhost:3100/api/docs>

### Conventions

- Throw Nest exceptions (`NotFoundException`, `ForbiddenException`), never bare `Error` — the filter maps them, a bare `Error` becomes a 500.
- Every query that reads user data is scoped by `userId`. Ownership is checked in the service, not assumed from the route.
- New configuration goes in `.env.example` with a comment, and in `docs/deployment.md` if production needs it.
- Tests name the behaviour and the reason, not the method. Mocks must not make an assertion vacuous — a cipher stand-in that embeds its input makes "never stores plaintext" pass regardless of the code.

---

## The extension

MV3, built with Vite. See `extension/README.md` for its own conventions.

### What it must handle

**SSE, not plain JSON.** `POST /ai/prompt/stream` emits `session` → `delta`* → `done`. Failures arrive as an `error` event because headers are already sent. A request better served elsewhere arrives as a single `redirect` event.

**Structured errors.** Branch on the `error` field:

| Code | Status | UI response |
| --- | --- | --- |
| `LIMIT_REACHED` | 403 | Nudge to sign in; body carries `limit` and `current` |
| `DAILY_QUOTA_REACHED` | 429 | Offer BYOK; body carries `resets_at` |
| `PROVIDER_ERROR` | 402/429/502 | `failure` distinguishes quota, rate limit and outage |

**Tier gates.** Anonymous users get 3 sessions, 5 files, no model switching, no BYOK. `GET /ai/models` marks non-default models `locked` for them, so the UI can explain the gate rather than hide it.

**Service workers are killed aggressively.** No state in memory; use `chrome.storage`.

---

## Current state

The API is feature-complete against the PRD. The extension is in progress.

Known gaps, all documented in `docs/deployment.md`: daily usage counters and magic-link tokens are in memory (single instance only), rate limiting is per instance, and no mail provider is configured — the mailer logs sign-in links rather than sending them.
