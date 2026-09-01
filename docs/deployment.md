# Deployment

## Required configuration

The app refuses to start in production when any of these is missing or still
holds the placeholder value from `.env.example`. That check is deliberate: a
deploy that inherits `your-super-secret-jwt-key-change-in-production` issues
forgeable tokens, which is worse than not starting.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL. **Enable storage-level encryption** — message content relies on it (ADR 001). |
| `JWT_SECRET` | At least 32 characters. Rotating it signs everyone out. |
| `ENCRYPTION_KEY` | 64 hex characters. Anything else is passed through scrypt. |
| `CORS_ORIGIN` | Comma separated. Must include the published extension origin, e.g. `chrome-extension://<id>`. |
| `ANTHROPIC_API_KEY` | The shared key. Optional if every user brings their own. |
| `OPENAI_API_KEY` | As above. |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**`ENCRYPTION_KEY` is load-bearing.** It protects stored BYOK keys and file
bodies. Rotating it makes both unreadable: BYOK keys degrade to the shared key
and users must reconnect, while file downloads fail outright. Keep it in a
secret store, not in the image, and version any rotation as a migration that
re-encrypts.

## Running

```bash
docker build -t nutch-api .
docker run --env-file .env -p 3100:3100 nutch-api
```

The container runs `prisma migrate deploy` before starting, so a release cannot
serve against an older schema. `migrate deploy` only applies committed
migrations and never creates one, which is what makes it safe unattended.

## Health checks

`GET /api/v1/health` returns 200 when the database is reachable and 503 when it
is not, so it works directly as a readiness probe. It never throws, so a probe
always receives an answer.

## What is not production ready yet

- **Daily usage counters and magic-link tokens are in memory.** They are correct
  for a single instance and reset on deploy. More than one replica needs Redis
  behind both, or users will see inconsistent quotas and links that only work on
  the instance that issued them.
- **No mail provider is configured.** `MailerService` logs the sign-in link
  instead of sending it, so magic-link sign-in works locally but not for real
  users. Replace the body of `send`; nothing else changes.
- **Rate limiting is per instance.** The global throttler counts in process
  memory, so N replicas allow N times the configured burst.
