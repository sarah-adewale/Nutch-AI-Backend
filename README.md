# Nutch

A browser-native AI assistant. Highlight anything on a page — text, code, an image — and ask a question about it without leaving the tab.

This repository holds both halves of the product:

```
src/          NestJS API: auth, AI routing, chat history, files, BYOK
extension/    Chrome extension (MV3): the sidebar users actually see
prisma/       Database schema and migrations
docs/         Architecture decisions and deployment
```

They live together because they share one contract. The extension branches on error codes (`LIMIT_REACHED`, `DAILY_QUOTA_REACHED`, `PROVIDER_ERROR`), reads response fields like `key_source` and `storage_limit_reached`, and consumes a named SSE event stream. Keeping both sides in one repository means adding a field and consuming it is a single change rather than two repositories drifting apart.

The two halves build, test and deploy independently. Nothing in `extension/` is part of the API's Docker image, and the API's test and lint commands do not reach into `extension/`.

---

## Running the API

**Requirements:** Node 20+, PostgreSQL 15+.

```bash
npm install
cp .env.example .env          # then fill in the values below
npx prisma migrate deploy     # create the tables
npm run start:dev
```

Swagger UI: <http://localhost:3100/api/docs>

### Configuration

`.env.example` documents every setting. Three matter before anything works:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Any long random string |
| `ENCRYPTION_KEY` | 64 hex characters — protects BYOK keys and file bodies |

Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

A provider key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) is needed for prompts to return answers. Without one, the API reports which models are unavailable rather than failing at request time.

> **Note:** npm 11 does not run install scripts by default, so Prisma's client is not generated automatically. Run `npx prisma generate` after installing, or approve once with `npm install-scripts approve @prisma/client prisma @prisma/engines`.

### Commands

| | |
| --- | --- |
| `npm run start:dev` | Development server with reload |
| `npm run build` | Compile to `dist/` |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests (needs a database) |
| `npm run test:cov` | Coverage |
| `npm run lint` | ESLint with `--fix` |
| `npx prisma studio` | Browse the database |

---

## Running the extension

See [`extension/README.md`](extension/README.md). In short: `cd extension && npm install && npm run dev`, then load `extension/dist` as an unpacked extension at `chrome://extensions`.

The extension needs the API running, and the API needs the extension's origin in `CORS_ORIGIN`:

```
CORS_ORIGIN="http://localhost:3100,chrome-extension://*"
```

---

## API

Everything is under `/api/v1`. Full request and response shapes are in Swagger.

**Auth** — `POST /auth/anonymous` · `GET /auth/google` · `GET /auth/github` · `POST /auth/magic-link` · `POST /auth/magic-link/verify` · `POST /auth/migrate-anonymous`

**AI** — `GET /ai/models` · `POST /ai/prompt` · `POST /ai/prompt/stream` (SSE)

**Chat** — `GET /chat/sessions` · `GET /chat/sessions/:id` · `DELETE /chat/sessions/:id` · `GET /chat/search`

**Files** — `GET /files` · `GET /files/:id/download` · `DELETE /files/:id`

**BYOK** — `GET /byok` · `POST /byok` · `DELETE /byok/:provider`

**Other** — `GET /users/profile` · `GET /health`

### Two things a client must handle

**Streaming.** `POST /ai/prompt/stream` returns server-sent events: `session`, then `delta` per chunk, then `done`. A failure arrives as an `error` event rather than a status code, because the headers are already sent by then. A request that should go elsewhere arrives as a single `redirect` event.

**Structured errors.** Beyond the status code, the body carries a machine-readable `error` field so the UI can respond specifically:

| Code | Status | Means |
| --- | --- | --- |
| `LIMIT_REACHED` | 403 | Anonymous storage cap hit; sign in |
| `DAILY_QUOTA_REACHED` | 429 | Daily prompt ceiling on the shared key; connect a key |
| `PROVIDER_ERROR` | 402/429/502 | Upstream problem; `failure` says which |

---

## User tiers

| | Anonymous | Signed in |
| --- | --- | --- |
| Chat sessions | 3 | Unlimited |
| Stored files | 5 | Unlimited |
| Model switching | No | Yes |
| Bring your own key | No | Yes |

Signing in migrates an anonymous session's work onto the account rather than discarding it.

---

## Further reading

- [`docs/adr-001-encryption-at-rest.md`](docs/adr-001-encryption-at-rest.md) — why messages are encrypted at the storage layer while files and API keys are encrypted in the application
- [`docs/deployment.md`](docs/deployment.md) — required configuration, container, and what is not production ready yet
