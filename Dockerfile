# syntax=docker/dockerfile:1.7
# BuildKit recomendado: DOCKER_BUILDKIT=1 (Portainer suele activarlo por defecto).
# Capas separadas: cambios en src/ no reinstalan deps ni recompilan el panel Next.js.

ARG NODE_VERSION=20-alpine

# ── Dependencias del bot (compilación nativa: canvas, etc.) ─────────────────
FROM node:${NODE_VERSION} AS bot-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,id=eyedbot-root-npm \
    npm ci --no-audit --no-fund && \
    npm prune --production && \
    npm cache clean --force

# ── Panel Next.js: deps + build (solo se invalida si cambia web/panel/) ─────
FROM node:${NODE_VERSION} AS panel-build
WORKDIR /panel
COPY web/panel/package.json web/panel/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,id=eyedbot-panel-npm \
    npm ci --no-audit --no-fund
COPY web/panel/ ./
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN --mount=type=cache,target=/panel/.next/cache,id=eyedbot-next-cache \
    npm run build && \
    npm prune --production && \
    npm cache clean --force

# ── Dependencias del servidor web (mercadopago, etc.) ───────────────────────
FROM node:${NODE_VERSION} AS web-deps
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,id=eyedbot-web-npm \
    npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# ── Imagen final (sin toolchain de compilación) ─────────────────────────────
FROM node:${NODE_VERSION} AS runtime
RUN apk add --no-cache ffmpeg opus su-exec
WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=bot-deps /app/node_modules ./node_modules

COPY src/ ./src/
COPY verificar-*.js ./

COPY web/server.js web/next-panel.js ./web/
COPY web/uploads/ ./web/uploads/
COPY --from=web-deps /web/node_modules ./web/node_modules
COPY --from=web-deps /web/package.json ./web/package.json

COPY --from=panel-build /panel/.next ./web/panel/.next
COPY --from=panel-build /panel/node_modules ./web/panel/node_modules
COPY --from=panel-build /panel/package.json ./web/panel/package.json
COPY --from=panel-build /panel/next.config.ts ./web/panel/next.config.ts
COPY --from=panel-build /panel/public ./web/panel/public

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    mkdir -p logs data backups && \
    chown -R node:node /app

ENV NODE_ENV=production

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
