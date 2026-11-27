# Sílabos UEB

Sistema web para elaborar, revisar, aprobar y firmar los sílabos de la Universidad Estatal de Bolívar. Admite varias facultades y carreras.

## Qué hace cada rol

| Rol | Tareas principales |
|---|---|
| Administración | Facultades, carreras, cuentas, plantilla del sílabo y periodos académicos. |
| Coordinación | Mallas, docentes, paralelos y proyecto de carrera; abre el proceso de sílabos de su carrera, revisa y aprueba. |
| Docente | Elabora su sílabo, lo firma y lo envía. |
| Biblioteca | Verifica la bibliografía y firma. |

Un sílabo enviado pasa primero por **Biblioteca** y después por **Coordinación**. Si alguna pide una corrección, vuelve al docente.

## Tecnologías

TypeScript en un monorepo de pnpm:

| Paquete | Carpeta | Contenido |
|---|---|---|
| `@silabos/web` | `apps/web` | Interfaz con Next.js 16 y React 19, shadcn/ui, Tailwind CSS 4 y Tiptap. No accede a la base de datos. |
| `@silabos/api` | `apps/api` | API con NestJS 12 y Prisma 7, y el proceso de tareas en segundo plano (*worker*). |
| `@silabos/shared` | `packages/shared` | Esquemas de validación (Zod) y reglas que usan la web y la API. |

| Servicio | Uso |
|---|---|
| PostgreSQL 18 | Base de datos. |
| Redis 7 | Colas (BullMQ), límites y bloqueos. |
| Gotenberg 8 | Convierte el Word del sílabo en PDF. Es opcional en desarrollo: sin él, el PDF es una versión simple. |
| MinIO u otro almacenamiento S3 | Archivos. En desarrollo se puede usar el disco (`STORAGE_DRIVER=local`). |
| Keycloak | Ingreso institucional, opcional. Solo autentica: la cuenta debe existir en el sistema. |

También se integra con un servidor de correo (SMTP), con el catálogo Koha de Biblioteca y con un proveedor de IA (DeepSeek) para los asistentes.

La web reenvía a la API las rutas `/api/*`, `/logos/*`, `/images/silabo/*` y `/plantilla.schema.json` (`apps/web/next.config.ts`). El navegador solo se comunica con la dirección de la web.

## Requisitos

- Node.js 24.
- pnpm 12. Con `corepack enable` se usa la versión fijada en `package.json`.
- PostgreSQL 18 y Redis 7.
- Gotenberg 8 (opcional en desarrollo).

## Configuración

Copie `.env.example` como `.env.local` en la raíz y complete sus valores. La API, el *worker*, Prisma y el script de datos iniciales leen ese archivo. **No lo suba al repositorio.**

| Variables | Para qué sirven |
|---|---|
| `DATABASE_URL`, `REDIS_URL`, `REDIS_PREFIX` | Base de datos y Redis. |
| `APP_KEY` | Clave de cifrado (`base64:` y 32 bytes). Con una base que ya tiene datos, conserve la misma. |
| `BETTER_AUTH_SECRET` | Firma la sesión. Es obligatoria; si cambia, se cierran todas las sesiones. |
| `FRONTEND_URL`, `BETTER_AUTH_URL` | Dirección pública del sistema. |
| `STATEFUL_DOMAINS` | Servidores y puertos de la web de los que la API acepta peticiones. |
| `API_PORT`, `API_INTERNAL_URL` | Puerto de la API (8000) y dirección que usa la web. La web la lee al compilar. |
| `STORAGE_DRIVER`, `STORAGE_PATH`, `S3_*` | Almacenamiento de archivos. |
| `GOTENBERG_URL` | Conversión a PDF. |
| `MAIL_*` | Correo. Con `MAIL_MAILER=log`, los mensajes se escriben en el registro. |
| `AI_*` | Asistentes de IA. Con `AI_DRIVER=baseline` funcionan sin un proveedor externo. |
| `CATALOG_DRIVER`, `KOHA_BASE_URL` | Catálogo de Biblioteca. |
| `KEYCLOAK_*` | Ingreso con Keycloak. |

La lista completa está en `.env.example` y en la sección de despliegue de [`docs/sistema.md`](docs/sistema.md).

## Desarrollo

```bash
corepack enable
pnpm install --frozen-lockfile   # también genera el cliente de Prisma
pnpm db:migrate                  # crea o actualiza las tablas
pnpm db:seed                     # solo la primera vez: ver «Base de datos»
pnpm dev                         # web en :3000 y API en :8000
pnpm worker                      # en otra terminal
```

- Sistema: <http://localhost:3000>
- Documentación de la API: <http://localhost:8000/api/docs>

El *worker* procesa las colas `critica`, `documentos`, `ia` y `general`. Necesita la API compilada, que `pnpm dev` y `pnpm build` mantienen actualizada.

## Base de datos

El esquema y las migraciones están en `apps/api/prisma/`. Las funciones, restricciones, índices especiales y vistas que Prisma no expresa están en el SQL de las migraciones.

| Comando | Qué hace |
|---|---|
| `pnpm db:migrate` | Aplica las migraciones pendientes. |
| `pnpm db:status` | Muestra su estado. |
| `pnpm db:seed` | Crea el administrador inicial y la plantilla oficial. Se puede repetir sin duplicarlos. |
| `pnpm db:generate` | Genera el cliente de Prisma. |
| `pnpm db:baseline` | Solo una vez, en una base que ya tenía el esquema inicial. Después ejecute `pnpm db:migrate`. |

Para `pnpm db:seed` defina `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` (y, si quiere, `SEED_ADMIN_NAME`).

**Antes de migrar una base con datos, haga un respaldo.** No edite migraciones ya aplicadas: cree una nueva.

## Pruebas

```bash
pnpm test:cambios   # solo las pruebas relacionadas con lo modificado
pnpm test           # todas las pruebas de Vitest
pnpm typecheck
pnpm lint
pnpm build && pnpm test:e2e   # navegador, con Playwright
```

Las pruebas de navegador usan la API compilada, la web en el puerto 3200 y el *worker*. Necesitan `E2E_PASSWORD`, `E2E_P12_PASSWORD` y las firmas de prueba (`apps/web/tests/e2e/.firmas` o `E2E_SIGNATURES_DIR`).

> **Cuidado:** las pruebas de navegador modifican datos; algunas pausan y finalizan el proceso de sílabos. Úselas solo con una base de pruebas, nunca en producción.

## Producción

Sin contenedores:

```bash
pnpm build
pnpm start     # API y web
pnpm worker    # en un proceso aparte
```

### Docker Compose

`compose.yaml` levanta la web, la API, el *worker*, PostgreSQL, Redis, MinIO y Gotenberg, y aplica las migraciones al arrancar.

```bash
cp .env.example .env      # complete los secretos
docker compose up -d --build
docker compose logs -f migrate api
```

Para llenar una base nueva, con las variables `SEED_ADMIN_*` definidas en su terminal:

```bash
docker compose run --rm -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD api node_modules/.bin/tsx scripts/seed.ts
```

El proxy con HTTPS no está incluido: configúrelo en el servidor.

### Dokploy

`compose.dokploy.yaml` despliega solo la web, la API y el *worker*. PostgreSQL, Redis, Gotenberg y MinIO deben existir ya en el servidor, y el *bucket* se crea una vez en MinIO.

**Aquí las migraciones no se ejecutan solas.** Respalde la base y ejecute en la terminal del servicio `silabos-api`:

```bash
node_modules/.bin/prisma migrate deploy
```

## Pendiente

- Conexión con los datos oficiales de la UEB. Ver [`docs/pendientes-conexion-ueb.md`](docs/pendientes-conexion-ueb.md).
- Cierre automático de los procesos vencidos y su aviso previo.
- Limpieza automática de los enlaces para restablecer la contraseña.

## Documentación

- [`docs/sistema.md`](docs/sistema.md): arquitectura, datos, API, seguridad, documentos, despliegue y pendientes.
- [`AGENTS.md`](AGENTS.md): reglas para trabajar en el código.
- [`odd/`](odd/README.md): documentos de las tareas grandes.
