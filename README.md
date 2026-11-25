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

## Database

Drizzle owns the schema. Tables, the enum, checks, indexes, foreign keys and the `docentes_vigentes_silabo` view live in `src/db/schema/` (`tables.ts`, `views.ts`, `relations.ts`). The database functions and triggers the app relies on (append-only history, single administrator, single active coordination, template change marks, export and review integrity) cannot be modelled by Drizzle, so the baseline `src/db/drizzle/0000_legal_edwin_jarvis.sql` carries them as SQL after the generated tables.

```bash
npm run db:migrate    # apply pending migrations
npm run db:seed       # administrator and official template (idempotent)
npm run db:generate   # write a migration after changing src/db/schema
npm run db:check      # migration history is consistent
npm run db:baseline   # mark the baseline as applied on a database restored from a dump (idempotent)
```

**New database.** `npm run db:migrate` creates the whole schema, then `npm run db:seed` creates the administrator from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (optional `SEED_ADMIN_NAME`, default «Administrador») and the official template. System settings need no rows: they fall back to the environment until an administrator changes them. Running the seed again changes nothing.

**Existing database.** Drizzle only applies migrations whose journal timestamp is newer than the last row of `drizzle.__drizzle_migrations`; it does not compare file hashes. Databases that already recorded the baseline (`npm run db:baseline`) and `0001_drop_audit_events` therefore skip both, and the rewritten baseline never runs on them. A database restored from a dump that has the tables but no migration rows needs `npm run db:baseline` once before `npm run db:migrate`; the command refuses to run on an empty database and does nothing when the baseline, or a later migration, is already recorded.

`0001_drop_audit_events.sql` drops the `eventos_auditoria` table when it exists. The Laravel-only tables `migraciones`, `cola_trabajos`, `datos_temporales` and `bloqueos_temporales` stay in old databases but are not part of the schema, are not created in new ones and are ignored by `drizzle-kit` (`tablesFilter`). The unused `btree_gist` extension of old databases is not created either.

## Validation

Request and form validation use [Zod](https://zod.dev). The shared schemas live in `src/schemas/`: the server parses the request input with them through `validateSchema` (`src/server/http/schemaValidation.ts`) and answers 422 with `{ message, errors: { field: [message] } }`; the React forms use the same field builders through `useSchemaForm` (`src/lib/forms.ts`, react-hook-form with `@hookform/resolvers/zod`). `applyApiErrors` puts the server's 422 errors on the matching fields, and a request without field errors shows its message above the form. Rules that need the database (unique email, active career) or the environment (production password strength) are passed to the schema factories only on the server. Some server routes still use the previous validator in `src/server/http/validation.ts` until they are migrated.

## Tests

```bash
npm run typecheck
npm run lint
npm test              # Vitest
npm run test:e2e      # Playwright against next start on port 3200 and the worker
```

The E2E suite needs `E2E_PASSWORD` and `E2E_P12_PASSWORD`, and the `.p12` signatures in `tests/e2e/.firmas` (or `E2E_SIGNATURES_DIR`). Redis-backed unit tests use database 15 of `REDIS_URL` or `REDIS_TEST_URL`.

`tests/e2e/template-editing.spec.ts` needs the institutional convocation open: it pauses it, edits and saves the template, restores it from the exported JSON, resumes the convocation (syllabi adapt to the template), finalizes it and opens a new period. Restore the database backup after running it. The template assistant is answered inside the browser, so no request reaches the AI provider.

## Docker

`compose.yaml` starts the web app, the worker, PostgreSQL, Redis and Gotenberg:

```bash
cp .env.example .env   # set APP_KEY and POSTGRES_PASSWORD at least
docker compose up --build
```

A new PostgreSQL volume starts empty: run `npm run db:migrate` and `npm run db:seed` against it, or put a dump of `silabos_ueb` (`*.sql` or `*.sql.gz`) in `docker/postgres-init/` before the first start and then run `npm run db:baseline` and `npm run db:migrate`. Stored files live in the `storage` volume (`STORAGE_PATH=/data/storage`).
