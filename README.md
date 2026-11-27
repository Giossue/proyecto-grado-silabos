# Sílabos UEB

Sistema web para **elaborar, revisar, aprobar y firmar** los sílabos de la Universidad Estatal de Bolívar. Admite varias facultades y carreras.

Reúne en un solo lugar la malla curricular, los docentes, el contenido que define cada carrera y el trabajo de cada docente. Cada sílabo se genera con los datos académicos ya cargados, pasa por revisión con firma digital y termina en un documento Word y PDF.

## Roles

| Rol | Qué hace |
|---|---|
| Administración | Gestiona facultades, carreras y cuentas, diseña la plantilla del sílabo y abre el proceso de sílabos de cada periodo académico. |
| Coordinación | Arma las mallas, registra docentes, crea paralelos y completa el proyecto de carrera. Abre el proceso de su carrera y aprueba los sílabos. |
| Docente | Elabora, firma y envía sus sílabos. |
| Biblioteca | Verifica la bibliografía y firma. |

Una persona puede tener varios roles y carreras, y elige con cuál trabaja.

## Cómo funciona

1. **Plantilla.** Administración define la plantilla institucional, única para toda la universidad. Cada campo indica quién lo llena: nadie (texto fijo), Coordinación o solo el docente.
2. **Proceso.** Administración abre el proceso de sílabos de un periodo académico con sus fechas. Necesita una plantilla utilizable.
3. **Preparación de la carrera.** Coordinación prepara la malla, los docentes, los paralelos y el **proyecto de carrera**: el contenido de cada materia que le corresponde. Puede llenar una materia o escribir un mismo campo en varias a la vez. Varios datos se pueden importar desde Excel.
4. **Apertura.** Para abrir el proceso de la carrera se requiere la plantilla, el logo de la facultad, la malla con materias, el proyecto de carrera completo y al menos un paralelo con docente. El sistema crea **un sílabo por paralelo con docente**; los demás se crean al asignarlo.
5. **Elaboración.** El docente completa su sílabo en línea, con guardado automático.
6. **Revisión.** El docente firma y envía. **Biblioteca** verifica la bibliografía, con apoyo del catálogo Koha, y **Coordinación** aprueba. Si alguna pide una corrección, el sílabo vuelve al docente.
7. **Documento final.** El sílabo aprobado queda en Word y PDF.

```
Docente  ──firma y envía──▶  Biblioteca  ──firma──▶  Coordinación  ──aprueba──▶  Word y PDF
   ▲                              │                        │
   └──────────── corrección ──────┴────────────────────────┘
```

**Estados de un sílabo:** Sin iniciar, Borrador, En revisión, Corrección solicitada y Aprobado.

Coordinación puede **pausar** el proceso de su carrera para cambiar la malla o el proyecto de carrera, y reanudarlo después.

### Otras funciones

- **Asistentes de IA:** uno ayuda a Administración a diseñar la plantilla. El del docente lee solo lo que tiene permitido y propone textos; el docente decide si los usa. Se puede desactivar.
- **Documentos de apoyo:** archivos que Coordinación comparte con los docentes de su carrera.
- **Avisos y correo:** avisos dentro del sistema y un resumen diario de pendientes.
- **Ayuda y accesibilidad:** guías en cada pantalla, tamaño del texto, alto contraste, modo sin animaciones y modo para dislexia.

## Arquitectura

```
                 Navegador
                     │  HTTPS
                     ▼
        apps/web · Next.js (:3000)
                     │  reenvía /api/*
                     ▼
        apps/api · NestJS (:8000) ───── Keycloak (opcional) · Koha
          │          │        │
          ▼          ▼        ▼
     PostgreSQL    Redis    Archivos (MinIO o disco)
                     │  colas
                     ▼
                  Worker ───── Gotenberg · Correo · Proveedor de IA

        packages/shared: validaciones y reglas comunes a la web y la API
```

- **Web:** muestra la interfaz y reenvía a la API las rutas `/api/*`, `/logos/*`, `/images/silabo/*` y `/plantilla.schema.json`. No accede a la base de datos. El navegador solo se comunica con la dirección de la web.
- **API:** concentra las reglas, los permisos y el acceso a los datos. La lógica de negocio está en `apps/api/src/server/` y los módulos de NestJS, en `apps/api/src/modules/`, la exponen bajo `/api/v1`.
- **Worker:** hace en segundo plano las tareas lentas: documentos, correos y asistentes de IA. Usa las colas `critica`, `documentos`, `ia` y `general`.
- **PostgreSQL:** es la fuente de verdad. Además de las tablas, usa restricciones, funciones y *triggers* para proteger la integridad.

### Documentos

Al enviar un sílabo, su contenido se congela con una huella **SHA-256**. Con esa versión, un generador propio arma el Word y Gotenberg lo convierte en PDF.

### Seguridad

- Sesiones guardadas en la base de datos, con cookie `HttpOnly`; contraseñas con bcrypt.
- La API solo acepta peticiones de las direcciones configuradas y limita los intentos de ingreso.
- Los permisos se comprueban en el servidor, por rol y por carrera.
- Todas las entradas se validan con Zod.
- Las aprobaciones se firman con el certificado digital `.p12` de cada persona. El servidor verifica la firma, la vigencia y el titular.

## Stack

| Área | Tecnologías |
|---|---|
| Lenguaje y entorno | TypeScript, Node.js 24, monorepo con pnpm |
| Interfaz | Next.js 16 (App Router), React 19, shadcn/ui sobre Radix UI, Tailwind CSS 4, Lucide |
| Formularios y datos | React Hook Form, Zod, TanStack Query |
| Editores | Tiptap para la plantilla y los sílabos; React Flow para la malla |
| API | NestJS 12 sobre Express, con Swagger (OpenAPI) |
| Datos | PostgreSQL 18 y Prisma 7 |
| Colas y límites | Redis 7 y BullMQ |
| Autenticación | Better Auth y, de forma opcional, Keycloak |
| Archivos | MinIO u otro almacenamiento S3, o disco local |
| Documentos | Generador de Word propio con JSZip, Gotenberg 8 para PDF y ExcelJS para Excel |
| Correo | Nodemailer y React Email |
| IA | Vercel AI SDK con DeepSeek |
| Pruebas | Vitest, Testing Library, Supertest y Playwright |
| Despliegue | Docker, Docker Compose y Dokploy |

## Estructura del repositorio

```
apps/web/          Interfaz (Next.js)
apps/api/          API, worker y base de datos (prisma/)
packages/shared/   Esquemas y reglas compartidas
assets/            Imágenes de los documentos
docs/              Documentación técnica
odd/               Documentos de las tareas grandes
compose.yaml           Despliegue completo con Docker Compose
compose.dokploy.yaml   Despliegue en Dokploy
```

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
| `AI_*` | Asistentes de IA. |
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

El modelo de datos y las migraciones están en `apps/api/prisma/`. Las funciones, restricciones, índices especiales y vistas que Prisma no expresa están en el SQL de las migraciones.

| Comando | Qué hace |
|---|---|
| `pnpm db:migrate` | Aplica las migraciones pendientes. |
| `pnpm db:status` | Muestra su estado. |
| `pnpm db:seed` | Crea el administrador inicial y la plantilla oficial. Se puede repetir sin duplicarlos. |
| `pnpm db:generate` | Genera el cliente de Prisma. |

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

## Documentación

- [`docs/sistema.md`](docs/sistema.md): detalle técnico del sistema.
- [`AGENTS.md`](AGENTS.md): reglas para trabajar en el código.
- [`odd/`](odd/README.md): documentos de las tareas grandes.
