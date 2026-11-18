# ---- Build stage: client (Vite + Cloudflare assets layout) and Node server ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY . .
RUN npm run build

# Prune to production dependencies for the runtime stage.
RUN npm prune --omit=dev

# ---- Runtime stage: single container serving API + SPA on one origin ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_PATH=/data/ryty.db \
    MIGRATIONS_DIR=/app/migrations \
    STATIC_DIR=/app/dist/client

# Runtime dependencies only: hono, @hono/node-server, @libsql/client (+ native libsql).
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev

COPY --from=build /app/dist/server /app/dist/server
COPY --from=build /app/dist/client /app/dist/client
COPY --from=build /app/migrations /app/migrations

# Non-root user; /data is the persistent volume.
RUN addgroup -S ryty && adduser -S ryty -G ryty \
    && mkdir -p /data \
    && chown -R ryty:ryty /data /app
USER ryty

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/server.mjs"]
