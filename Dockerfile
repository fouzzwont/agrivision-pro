# syntax=docker/dockerfile:1

# ---- dependencies -----------------------------------------------------------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Node target: no Cloudflare plugin, server bundle at dist/server/server.node.js
ENV DEPLOY_TARGET=node
RUN bun run build

# ---- production dependencies ------------------------------------------------
FROM oven/bun:1 AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- runtime ----------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY scripts/cron-digest.mjs ./scripts/cron-digest.mjs

EXPOSE 3000
CMD ["node", "dist/server/server.node.js"]
