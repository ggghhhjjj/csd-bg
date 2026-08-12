# Node.js Dockerfile for CSD-BG Free Float Scraper
FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/cli/package.json ./packages/cli/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/core ./packages/core
COPY packages/cli ./packages/cli

RUN npm run build -w @csd-bg/core && npm run build -w @csd-bg/cli \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM node:22-slim

ARG APP_UID=1031
ARG APP_GID=65538

ENV NODE_ENV=production \
    APP_UID=${APP_UID} \
    APP_GID=${APP_GID}

WORKDIR /app

RUN mkdir -p /data \
    && groupadd -r -g "$APP_GID" appuser 2>/dev/null || true \
    && useradd -r -u "$APP_UID" -g "$APP_GID" appuser 2>/dev/null || true \
    && chown -R "$APP_UID":"$APP_GID" /app /data

COPY --from=builder --chown=appuser:appuser /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=appuser:appuser /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=appuser:appuser /app/packages/cli/package.json ./packages/cli/
COPY --from=builder --chown=appuser:appuser /app/packages/cli/dist ./packages/cli/dist

USER appuser

VOLUME ["/data"]

ENTRYPOINT ["node", "packages/cli/dist/index.js"]
CMD ["scrape,download,extract", "--csv", "/data/free_float.csv", "--db", "/data/free_float.db", "--log", "/data/app.log"]
