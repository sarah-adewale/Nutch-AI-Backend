# syntax=docker/dockerfile:1

# --- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
# Full install: the Nest CLI and TypeScript are needed to compile.
RUN npm ci && npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# --- runtime -------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
# Production dependencies only; prisma generate is still required because the
# client is generated into node_modules rather than committed.
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run unprivileged. The node image ships a `node` user for exactly this.
USER node

EXPOSE 3100
# Migrations run before the server so a deploy cannot serve against an old
# schema. `migrate deploy` applies committed migrations and never generates new
# ones, which is what makes it safe to run unattended.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
