FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npx next build

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/assets ./assets
USER app
EXPOSE 3000
CMD ["node", "server.js"]

FROM deps AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY . .
RUN groupadd --system app && useradd --system --gid app app && chown -R app:app /app
USER app
CMD ["npx", "tsx", "--conditions=react-server", "src/server/queue/worker.ts"]
