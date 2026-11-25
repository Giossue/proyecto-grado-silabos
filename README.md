# Sílabos UEB

Next.js app (App Router, React 19) that serves both the web interface and the `/api/v1` API of the syllabus system. It uses PostgreSQL through Drizzle, Redis for queues (BullMQ), rate limits, locks and the two-factor replay guard, and Gotenberg to turn Word documents into PDF.

## Requirements

- Node.js 24 and npm
- PostgreSQL 17 with the `silabos_ueb` database
- Redis 7
- Gotenberg 8 (optional: without it the PDF is the plain-text version)

## Configuration

Copy `.env.example` to `.env.local` and fill it in. The main variables:

| Variable | Purpose |
|---|---|
| `APP_KEY` | Key that encrypts the session cookie and the session payload (`base64:` + 32 bytes). Keep the same value to keep users logged in. |
| `APP_NAME` | Name shown in mails and 2FA apps; its slug names the session cookie unless `SESSION_COOKIE` is set. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL`, `REDIS_PREFIX` | Redis connection and key prefix. |
| `GOTENBERG_URL` | Gotenberg address for PDF conversion. |
| `SESSION_LIFETIME` | Session lifetime in minutes (240 today). |
| `STATEFUL_DOMAINS` | Hosts (with port) whose requests use the session cookie. |
| `STORAGE_PATH` | Root of the stored files (`private/` and `public/`). It must point at the same folder the database records refer to. |
| `PUBLIC_ASSETS_PATH` | Folder with the default logos; `assets/` by default. |
| `QUEUE_MAX_TIME` | Seconds before the worker exits; `0` keeps it running. |
| `MAIL_*` | Mail transport (`log` writes mails to the log). |
| `AI_*`, `CATALOG_DRIVER`, `KOHA_BASE_URL` | Template assistant and library catalog. |

## Run

```bash
npm ci
npm run dev       # http://localhost:3000
npm run worker    # queues: critica, documentos, ia, general
```

Production:

```bash
npm run build
npm run start     # or: NEXT_OUTPUT=standalone npx next build && node .next/standalone/server.js
npm run worker
```

## Database migrations

Drizzle owns the schema. `src/db/drizzle/schema.ts` and the baseline `src/db/drizzle/0000_legal_edwin_jarvis.sql` come from `drizzle-kit pull` on the current database; the baseline is commented out, so applying it changes nothing and only records it as applied.

```bash
npm run db:check      # migration history is consistent
npm run db:generate   # write a migration after changing schema.ts
npm run db:migrate    # apply pending migrations (the first run records the baseline in drizzle.__drizzle_migrations)
```

`src/db/pending/drop_audit_events.sql` drops the `eventos_auditoria` table. It is not part of the migration history on purpose: the original system still writes to that table. When it is safe, remove `eventosAuditoria` from `schema.ts`, run `npx drizzle-kit generate --custom --name drop_audit_events`, paste that SQL into the new file and run `npm run db:migrate`.

## Tests

```bash
npm run typecheck
npm run lint
npm test              # Vitest
npm run test:e2e      # Playwright against next start on port 3200 and the worker
```

The E2E suite needs `E2E_PASSWORD` and `E2E_P12_PASSWORD`, and the `.p12` signatures in `tests/e2e/.firmas` (or `E2E_SIGNATURES_DIR`). Redis-backed unit tests use database 15 of `REDIS_URL` or `REDIS_TEST_URL`.

## Docker

`compose.yaml` starts the web app, the worker, PostgreSQL, Redis and Gotenberg:

```bash
cp .env.example .env   # set APP_KEY and POSTGRES_PASSWORD at least
docker compose up --build
```

A new PostgreSQL volume starts empty: put a dump of `silabos_ueb` (`*.sql` or `*.sql.gz`) in `docker/postgres-init/` before the first start, then run `npm run db:migrate`. Stored files live in the `storage` volume (`STORAGE_PATH=/data/storage`).
