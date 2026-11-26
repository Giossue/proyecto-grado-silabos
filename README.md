# Sílabos UEB

pnpm monorepo of the syllabus system:

| Package | Path | What it is |
|---|---|---|
| `@silabos/web` | `apps/web` | Next.js 16 interface (App Router, React 19). It has no database or Redis access: every `/api/*` request goes to the API. |
| `@silabos/api` | `apps/api` | NestJS 12 API on port 8000 (`/api/v1`, Swagger UI at `/api/docs`) and the queue worker. PostgreSQL through Prisma, Redis for queues (BullMQ), rate limits, locks and the two-factor replay guard, and Gotenberg to turn Word documents into PDF. |
| `@silabos/shared` | `packages/shared` | Zod schemas with their Spanish messages, block rules and state labels used by both sides. |

The web app proxies `/api/*`, `/logos/*`, `/images/silabo/*` and `/plantilla.schema.json` to the API with Next `rewrites` (`apps/web/next.config.ts`, target `API_INTERNAL_URL`, `http://localhost:8000` by default), so the browser only talks to the web origin and the session cookie, `Origin` checks and 401/409 rules are unchanged.

## Requirements

- Node.js 24 and pnpm 12 (`corepack enable` installs the version pinned in `package.json`)
- PostgreSQL 17 with the `silabos_ueb` database
- Redis 7
- Gotenberg 8 (optional: without it the PDF is the plain-text version)

## Configuration

Copy `.env.example` to `.env.local` at the repository root and fill it in. The API, the worker, Prisma and the seed read that file (`apps/api/src/config/load-env.ts`, `apps/api/prisma.config.ts`); the web app only needs `API_INTERNAL_URL` when the API is not on `http://localhost:8000`, and reads it at build time. The main variables:

| Variable | Purpose |
|---|---|
| `APP_KEY` | Key (`base64:` + 32 bytes) that encrypts the stored AI API key. Keep the value the database was written with. |
| `BETTER_AUTH_SECRET` | Secret of [Better Auth](https://better-auth.com): signs the session cookie and encrypts the 2FA secrets and recovery codes. Required; changing it signs everyone out and breaks the stored 2FA secrets. |
| `BETTER_AUTH_URL` | Public base URL of the app; `FRONTEND_URL` when unset. |
| `APP_NAME` | Name shown in mails and 2FA apps. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL`, `REDIS_PREFIX` | Redis connection and key prefix. |
| `GOTENBERG_URL` | Gotenberg address for PDF conversion. |
| `SESSION_LIFETIME` | Session lifetime in minutes (240 today); every request renews it, at most once a minute. |
| `SESSION_COOKIE_PREFIX` | Prefix of the auth cookies (`silabos-ueb` gives `silabos-ueb.session_token`). |
| `STATEFUL_DOMAINS` | Hosts (with port) of the web app. They are Better Auth's trusted origins: a request whose `Origin` (or `Referer`) is not one of them gets 401, and login answers 400. |
| `STORAGE_PATH` | Root of the stored files (`private/` and `public/`). It must point at the same folder the database records refer to. |
| `PUBLIC_ASSETS_PATH` | Folder with the default logos; `assets/` by default. |
| `QUEUE_MAX_TIME` | Seconds before the worker exits; `0` keeps it running. |
| `API_PORT` | Port of the API; `8000` by default (the Keycloak redirect will use it). |
| `API_INTERNAL_URL` | Where the web app sends `/api/*`; `http://localhost:8000` by default. |
| `SHADOW_DATABASE_URL` | Optional scratch database for `prisma migrate dev`; deploys do not need it. |
| `MAIL_*` | Mail transport (`log` writes mails to the log). |
| `AI_*`, `CATALOG_DRIVER`, `KOHA_BASE_URL` | Template assistant and library catalog. |

## Run

```bash
pnpm install --frozen-lockfile   # also runs prisma generate in apps/api
pnpm dev       # web on http://localhost:3000, API on http://localhost:8000 (nest start --watch)
pnpm worker    # queues: critica, documentos, ia, general (runs apps/api/dist, kept fresh by pnpm dev or pnpm build)
```

API documentation: http://localhost:8000/api/docs (OpenAPI JSON at `/api/docs-json`).

Production:

```bash
pnpm build     # apps/api (prisma generate + nest build) and apps/web (next build)
pnpm start     # node apps/api/dist/apps/api/src/main.js and next start
pnpm worker
```

Every root script runs in the workspaces: `pnpm test`, `pnpm typecheck`, `pnpm lint` (each package), `pnpm --filter @silabos/api <script>` for one package.

## Database

Prisma owns the schema and the migrations (`apps/api/prisma/`). `schema.prisma` was introspected from the database with `prisma db pull`; `migrations/0_baseline/migration.sql` is the complete schema the three migrations of the previous ORM built, including the database functions and triggers (append-only history, single administrator, single active coordination, template change marks, export and review integrity), the checks, the partial and expression indexes and the `docentes_vigentes_silabo` view that `schema.prisma` cannot express. The services use the typed client through `PrismaService`; `$queryRaw` stays only where the old query was raw SQL. Prisma is the only database layer of the API.

```bash
pnpm db:migrate    # prisma migrate deploy: apply pending migrations
pnpm db:status     # prisma migrate status
pnpm db:seed       # apps/api/scripts/seed.ts: administrator, its credential and the official template (idempotent; also prisma db seed)
pnpm db:baseline   # prisma migrate resolve --applied 0_baseline, once on a database that already has the schema
pnpm db:pull       # re-introspect into schema.prisma (then drop the Laravel-only models, see below)
pnpm db:generate   # regenerate the client in apps/api/src/generated/prisma (git-ignored)
```

**New database.** `pnpm db:migrate` creates the whole schema, including the Better Auth tables, then `pnpm db:seed` creates the administrator with its credential account from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (optional `SEED_ADMIN_NAME`, default «Administrador») and the official template. System settings need no rows: they fall back to the environment until an administrator changes them. Running the seed again changes nothing.

**Existing database.** A database built by the previous migrations (or restored from a dump) already has the schema: run `pnpm db:baseline` once, which only records `0_baseline` in `_prisma_migrations` and changes no data, then `pnpm db:migrate` for later migrations. New migrations are written with `prisma migrate dev --create-only` against a `SHADOW_DATABASE_URL`, reviewed, and applied with `pnpm db:migrate`. The old migration history (`drizzle.__drizzle_migrations`) stays in old databases and is no longer read or written.

**Authentication.** Login, sessions and 2FA use [Better Auth](https://better-auth.com) on the Prisma adapter (`apps/api/src/server/auth/betterAuth.ts`, bound to `PrismaService` with `bindAuthDatabase`), mounted inside the API. In Nest, `@Authenticated()` (`apps/api/src/common/decorators/`) runs the same session check through `SessionGuard` (origin, cookie, inactive account, verified email, active role → 401/403/409), `@Roles()` adds `RolesGuard`, and `@CurrentSession()` gives the controller the session and its active role. Its user model is `usuarios` itself (`PRISMA_AUTH_SCHEMA` in `apps/api/src/server/auth/prismaAuthDatabase.ts` maps `nombre_usuario`, `correo_electronico`, `usuario_activo`, and reads `correo_verificado_en` and `dos_factores_confirmado_en` as flags); `0_baseline` includes `sesiones_usuario` (with the session's active role), `cuentas_usuario`, `verificaciones_usuario` and `dos_factores_usuario`; the seed copies the administrator's bcrypt hash of `usuarios.contrasena` into a credential account. Passwords stay bcrypt (`$2y$`, `BCRYPT_ROUNDS`); every password write also updates `usuarios.contrasena`. The one-time move of the old system's credentials and confirmed 2FA secrets into Better Auth (`db:migrate-auth`) was already applied to `silabos_ueb` (no user is left without a credential account or with an unmoved 2FA secret) and was removed; dumps taken after that migration need nothing else. The old `sesiones` table is no longer read or written; it stays in the database until a later migration drops it.

`0_baseline` drops the `eventos_auditoria` table when it exists. The Laravel-only tables `migraciones`, `cola_trabajos`, `datos_temporales` and `bloqueos_temporales` stay in old databases but are not part of the schema and are not created in new ones; `prisma db pull` brings them back as models, which must be removed from `schema.prisma` again. The unused `btree_gist` extension of old databases is not created either.

## Validation

Request and form validation use [Zod](https://zod.dev). The shared schemas live in `packages/shared/src/schemas/` (imported as `@silabos/shared/schemas/...`). In the API, a Nest DTO is `createZodDto(schema)` from `nestjs-zod`, which also feeds Swagger; the global `ZodValidationPipe` (`apps/api/src/common/pipes/`) validates `@Body()` and `@QueryInput()` with `validateSchema` (`apps/api/src/server/http/schemaValidation.ts`) and answers 422 with `{ message, errors: { field: [message] } }`, the same Spanish messages and key order as before. The React forms use the same field builders through `useSchemaForm` (`apps/web/src/lib/forms.ts`, react-hook-form with `@hookform/resolvers/zod`). `applyApiErrors` puts the server's 422 errors on the matching fields, and a request without field errors shows its message above the form. Rules that need the database (unique email, active career) or the environment (production password strength) are passed to the schema factories only on the server. Every server route validates with these schemas. `packages/shared/src/schemas/fields.ts` holds the field builder (`field`, `requiredField`, `nullableField`, `sometimesField` and the `is.*` checks) that keeps the Spanish messages, the size rules (characters, numbers or list items) and the per-item checks of lists (`checkItems`); a schema can declare the order of its error keys with `.meta({ errorOrder })`.

Client data goes through [TanStack Query](https://tanstack.com/query). `AppProviders` mounts one `QueryClientProvider` with the client from `getQueryClient()` (`apps/web/src/lib/queryClient.ts`): no retries for 4xx answers, no refetch on window focus. Query keys and query options live per area in `apps/web/src/queries/` (`dashboard`, `notifications`, `reviews`, `library`, `teacher`, `careerAcademics`, ...) and call the `apps/web/src/api/*` functions, which keep the 401/409 events and `ApiError`; requests carry only the session cookie, since the server checks the origin instead of an XSRF token. Lists keep the URL-synced filters in an "applied" state that is part of the query key, so the latest filter always wins, and `placeholderData: keepPreviousData` keeps the previous page on screen while the next one loads. Polling uses `refetchInterval` (the template assistant every 2.5 s, generated PDFs and support documents every 4 s while they are pending). Writes refresh with `invalidateQueries` or `setQueryData`; any successful write still fires `silabos:mutated`, which invalidates the `dashboard` queries (deadline and «Antes de empezar»). The session, the deadline, the setup checklist and the screen help stay readable outside React (`sessionState`, `deadlineState`, ...), but their data now lives in the same query cache. Editors that keep a local draft (syllabus, career project, template JSON) load through `queryClient.fetchQuery`. In Vitest, `renderWithProviders` and `createWrapper` (`apps/web/src/test/render.tsx`) give every test a fresh `QueryClient` without retries.

## JSON and mail

API responses are plain JSON written with `Response.json` (`apiJson` and `jsonError` in `apps/api/src/server/http/responses.ts`). Nest controllers return plain objects; `ApiResponseInterceptor` turns them into the same `apiJson` response (status from `@HttpCode`, security headers, `X-RateLimit-*` from `@Authenticated({ rateLimit })`) and `ApiExceptionFilter` writes errors in the same shapes. Paths below are relative to `apps/api/`. `phpShape` (`src/server/configuration/phpValues.ts`) still writes empty records as `[]` in template documents, because the client, the stored documents and the syllabus snapshots expect that shape. Hashes and signatures keep their own fixed encoders: `canonicalJson` (`src/server/documents/canonicalJson.ts`) for the syllabus snapshot and its SHA-256, `historicalFieldDocument.ts` for the field text of snapshot documents and the Word file, the ficha workbook fingerprint (`src/server/ficha/fichaWorkbook.ts`), `definitionHash` (`src/server/ficha/definitionHash.ts`) for the field hashes stored in exported workbooks, and `phpJson` (`src/server/ai/php.ts`) for the template assistant's draft fingerprint and tool payloads. Changing any of them breaks existing hashes or documents.

Mails are [React Email](https://react.email) components in `apps/api/src/server/mail/templates/` (`MailLayout` with the header, button and subcopy, plus one component per mail). `renderMailable` (`src/server/mail/mailables.tsx`) renders the HTML and the plain-text version with `@react-email/render`.

## Porting an area to Nest

The reference is `apps/api/src/modules/notifications/`: a thin controller with `@Authenticated()`, DTOs from the shared Zod schemas, a service that reuses `src/server/**`, a Prisma repository, and `notifications.equivalence.test.ts`, which sends the same requests to the old route handler and to the Nest app (Supertest) and compares status, body, headers and writes. Every area is a Nest controller listed in `PORTED_CONTROLLERS` (`apps/api/src/modules/ported-routes.ts`); controllers that read a body apply `PhpInputMiddleware`, and `FallbackModule` answers unknown routes and methods (404/405) like before.

## Tests

```bash
pnpm typecheck
pnpm lint
pnpm test              # Vitest in packages/shared, apps/web and apps/api
pnpm build && pnpm test:e2e   # Playwright: next start on port 3200, the built API on 8000 and the worker
```

The E2E suite needs `E2E_PASSWORD` and `E2E_P12_PASSWORD`, and the `.p12` signatures in `apps/web/tests/e2e/.firmas` (or `E2E_SIGNATURES_DIR`). Redis-backed unit tests use database 15 of `REDIS_URL` or `REDIS_TEST_URL`.

`apps/web/tests/e2e/template-editing.spec.ts` needs the institutional convocation open: it pauses it, edits and saves the template, restores it from the exported JSON, resumes the convocation (syllabi adapt to the template), finalizes it and opens a new period. Restore the database backup after running it. The template assistant is answered inside the browser, so no request reaches the AI provider.

## Docker

> Not updated to the `apps/` layout yet: the Dockerfile and `compose.yaml` still build the single Next.js app. They move to separate web, API, PostgreSQL 18 and MinIO containers in the next stage.

`compose.yaml` starts the web app, the worker, PostgreSQL, Redis and Gotenberg:

```bash
cp .env.example .env   # set APP_KEY and POSTGRES_PASSWORD at least
docker compose up --build
```

A new PostgreSQL volume starts empty: run `pnpm db:migrate` and `pnpm db:seed` against it (in the container: `docker compose run --rm api node_modules/.bin/tsx scripts/seed.ts`), or put a dump of `silabos_ueb` (`*.sql` or `*.sql.gz`) in `docker/postgres-init/` before the first start and then run `pnpm db:baseline` and `pnpm db:migrate`. Stored files live in the `storage` volume (`STORAGE_PATH=/data/storage`).
