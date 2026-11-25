# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/src/config/workspace.ts apps/api/src/config/workspace.ts
RUN pnpm install --frozen-lockfile --filter @silabos/api... --filter @silabos/shared

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @silabos/api build

FROM build AS runtime
ENV NODE_ENV=production API_PORT=8000 PUBLIC_ASSETS_PATH=/app/assets STORAGE_PATH=/data/storage
COPY assets /app/assets
RUN mkdir -p /data/storage && chown -R node:node /data
WORKDIR /app/apps/api
USER node
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.API_PORT||8000)+'/api/v1/session').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
CMD ["node", "dist/apps/api/src/main.js"]
