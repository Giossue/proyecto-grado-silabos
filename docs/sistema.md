# Sistema web de gestión de sílabos: documentación técnica

Proyecto: «Desarrollo de un sistema web configurable para la gestión de sílabos académicos con asistencia de inteligencia artificial en la Carrera de Software»
Universidad Estatal de Bolívar · Facultad de Ciencias Administrativas, Gestión Empresarial e Informática
Estado: noviembre de 2026

---

## 1. Resumen

Aplicación web que cubre el ciclo completo del sílabo:

1. **Administración** registra facultades, carreras, períodos y usuarios. También diseña la **plantilla institucional del sílabo** y abre el proceso de elaboración de cada período.
2. **Coordinación** arma la malla, programa las materias, crea los paralelos, asigna docentes y completa el **proyecto de carrera**.
3. Al abrir el proceso, el sistema **genera un sílabo por paralelo** con los datos académicos ya cargados.
4. El **docente** lo llena en línea, con guardado automático, y lo envía. **Biblioteca** verifica la bibliografía contra el catálogo Koha y **Coordinación** lo aprueba.
5. Cada aprobación se **firma con certificado digital (.p12)**. El sílabo aprobado queda como **Word y PDF**, con su huella SHA-256.
6. Un **asistente de IA** ayuda a Administración a diseñar la plantilla.

Roles: **Administrador, Coordinador, Docente y Bibliotecario**. Una persona puede tener varios roles y carreras; elige con cuál trabaja en cada sesión.

---

## 2. Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Lenguaje | TypeScript | 5.9 |
| Entorno de ejecución | Node.js | 24 |
| Gestor de paquetes | pnpm | 12.15 |
| Interfaz web | Next.js (App Router, Turbopack) | 16.4 |
| API | NestJS sobre Express, con Swagger UI (OpenAPI) | 12.6 |
| Interfaz | React | 19.3 |
| Componentes | shadcn/ui sobre Radix UI, Tailwind CSS 4, íconos Lucide | — |
| Formularios y validación | react-hook-form + Zod; en la API, DTO de `nestjs-zod` hechos con los mismos esquemas | 7.92 / 4.6 / 5.6 |
| Datos en el cliente | TanStack Query (caché, reintentos, invalidación) | 5.108 |
| Editor de plantilla y sílabo | Tiptap (ProseMirror) | 3.32 |
| Malla visual | React Flow (@xyflow/react) | 13 |
| Base de datos | PostgreSQL | 18 |
| Archivos | Disco local o almacenamiento S3 (MinIO), según `STORAGE_DRIVER`; cliente `@aws-sdk/client-s3` | 3 |
| ORM y migraciones | Prisma ORM y Prisma Migrate (única capa de datos de la API) | 7.10 |
| Colas, límites y bloqueos | Redis + BullMQ (ioredis) | 7 / 6.7 |
| Autenticación | Better Auth (usuario y contraseña) | 1.7 |
| Correos | Nodemailer + React Email | 10.6 |
| Word del sílabo | Generador propio en TypeScript + JSZip | — |
| PDF | Gotenberg (LibreOffice) | 8 |
| Excel (importaciones y ficha) | ExcelJS | 4.4 |
| Firma digital | node-forge, PKI.js, asn1js (verificación CMS de certificados .p12) | — |
| IA | Vercel AI SDK con DeepSeek | 7 |
| Pruebas | Vitest + Testing Library + Supertest (unitarias) · Playwright (de extremo a extremo) | 5.1 / 1.65 |
| Repositorio | pnpm workspaces: `apps/web`, `apps/api` y `packages/shared` | — |
| Contenedores | Docker y Docker Compose | — |

---

## 3. Arquitectura

```
 Navegador (React)
      │  HTTPS · cookie de sesión (mismo origen que la interfaz)
      ▼
┌──────────────────────────────────────────────┐
│  apps/web · Next.js (puerto 3000)            │
│  · Páginas React (App Router)                │
│  · Reenvía /api/*, /logos/*, /images/silabo/*│
│    y /plantilla.schema.json a la API         │
└───────┬──────────────────────────────────────┘
        │ rewrites (proxy HTTP)
        ▼
┌──────────────────────────────────────────────┐
│  apps/api · NestJS (puerto 8000)             │
│  · /api/v1: controladores por módulo         │
│  · Swagger UI en /api/docs                   │
│  · Sesión (Better Auth) y roles como guards  │
│  · Validación (Zod + nestjs-zod)             │
│  · 404/405 de rutas desconocidas (fallback)  │
└───────┬───────────────────┬──────────────────┘
        │ Prisma            │ encola trabajos
        ▼                   ▼
  ┌───────────┐       ┌───────────┐
  │PostgreSQL │       │  Redis    │  colas, límites de intentos y bloqueos
  └───────────┘       └─────┬─────┘
        ▲                   │
        │                   ▼
┌───────┴──────────────────────────────────────┐
│  Worker (apps/api, entrada worker.ts)        │
│  · Genera Word → PDF (Gotenberg)             │
│  · Envía correos (SMTP)                      │
│  · Responde al asistente de IA (DeepSeek)    │
└──────────────────────────────────────────────┘

 Servicios externos: Gotenberg · SMTP · DeepSeek · Koha (catálogo de Biblioteca)
 Archivos (logos, PDF, documentos de apoyo): disco del servidor (STORAGE_PATH)
```

- **Un repositorio pnpm con tres paquetes:**
  - `apps/web` (`@silabos/web`): la interfaz Next.js. No toca la base ni Redis; todo pasa por la API.
  - `apps/api` (`@silabos/api`): la API NestJS y el worker. Toda la lógica de negocio vive aquí.
  - `packages/shared` (`@silabos/shared`): esquemas Zod con sus mensajes, reglas de bloques y textos de estados que usan ambos lados. La interfaz lo importa como paquete; la API lo compila dentro de su salida con el alias `@silabos/shared/*` de su `tsconfig.json`.
- **Mismo origen en desarrollo:** el navegador solo habla con `http://localhost:3000`; Next reenvía la API a `API_INTERNAL_URL` (por defecto `http://localhost:8000`) con `rewrites`. Así la cookie de sesión, el `Origin` y las reglas 401/409 siguen iguales. La API también acepta CORS con credenciales para los orígenes de `FRONTEND_URL` y `STATEFUL_DOMAINS`.
- **Organización de la API** (`apps/api/src/`):
  - `main.ts`, `bootstrap.ts` y `app.module.ts`: arranque, prefijo global `api/v1`, CORS, `cookie-parser`, Swagger y los componentes globales.
  - `common/`: `decorators` (`@Authenticated()`, `@Roles()`, `@CurrentSession()`, `@QueryInput()`), `guards` (sesión y roles), `pipes` (`ZodValidationPipe`), `filters` (formato de errores), `interceptors` (respuesta JSON con las cabeceras de siempre), `middleware` (cuerpo crudo y entrada al estilo PHP), `dtos`.
  - `modules/`: un módulo Nest por área (`auth`, `notifications`, `academic`, `syllabus`, `template`, `ai`, `library`, `dashboard`, `help`, `exports`, `files`, `users`, `settings`, `ficha`, `mail`, `queue`, `processes`, `keycloak` y `fallback`), cada uno con controlador, servicio, DTO y repositorio Prisma; `notifications` es el modelo de referencia.
  - `prisma/`: `PrismaService` (cliente con el adaptador `pg`).
  - `server/`: la lógica de negocio por módulo, en TypeScript, que los servicios reutilizan.
- **Organización de la interfaz** (`apps/web/src/`): `app/` (páginas por rol), `components/` (`ui/` de shadcn y `domain/`), `queries/` y `api/` (acceso a la API), `lib/`, `composables/`, `state/`.

---

## 4. Modelo de datos (PostgreSQL)

| Área | Tablas |
|---|---|
| Estructura académica | `facultades`, `carreras`, `periodos_academicos`, `asignaturas`, `requisitos_asignatura`, `paralelos` |
| Personas y roles | `usuarios`, `asignaciones_rol`, `asignaciones_paralelo`, `invitaciones_activacion`, `restablecimientos_contrasena` |
| Sesiones (Better Auth) | `sesiones_usuario`, `cuentas_usuario`, `verificaciones_usuario`, `dos_factores_usuario` |
| Plantilla del sílabo | `plantilla_silabo`, `secciones_plantilla`, `campos_plantilla`, `definiciones_campo` |
| Proceso del período | `convocatorias_universidad` (institucional), `convocatorias_carreras` (por carrera) |
| Sílabos | `silabos`, `valores_campo`, `revisiones_silabo`, `envios_biblioteca`, `revisiones_coordinacion`, `aprobaciones`, `firmas_silabo` |
| Documentos | `exportaciones_silabo`, `archivos`, `documentos_apoyo` |
| IA | `mensajes_ia_plantilla`, `propuestas_ia_plantilla` |
| Sistema | `notificaciones`, `ajustes_sistema` |

- **Migraciones con Prisma:** el esquema está en `apps/api/prisma/schema.prisma` (sacado de la base con `prisma db pull`) y la migración base `0_baseline` reproduce el esquema completo, con funciones, triggers y la vista. `pnpm db:migrate` (`prisma migrate deploy`) crea una base desde cero y `pnpm db:seed` (`apps/api/scripts/seed.ts`, con Prisma) crea el administrador inicial con su cuenta de credenciales y la plantilla oficial; se puede repetir sin cambiar nada. La migración única de credenciales del sistema anterior a Better Auth (`db:migrate-auth`) ya se aplicó a `silabos_ueb` y se eliminó. En una base existente la migración base se marca como aplicada con `pnpm db:baseline`.
- **Integridad en la base:**
  - claves foráneas;
  - restricciones `CHECK` (estados, jornadas, rangos);
  - índices únicos;
  - una vista: `docentes_vigentes_silabo`.
- **Cada envío de sílabo** guarda una **instantánea** del contenido y su **SHA-256**. Lo aprobado no cambia.
- **Formación del docente:** es el campo `formacion_docente` de la sección «Identificación» de la plantilla. Lo llena el docente en cada sílabo; la definición de la plantilla lo marca en `teacher_fields`, así que no aparece en el perfil de la asignatura de Coordinación ni en la ficha en Excel. En el Word y el PDF sale en la misma fila de la tabla de identificación (variable `formacion_docente`), no como bloque aparte. Es obligatorio para enviar.
- **Arrastre entre sílabos:** cada valor guarda en `valores_campo.huella_definicion_campo` el SHA-256 de la definición del campo con la que se escribió. Al generar o iniciar un sílabo, si un campo del docente está vacío, toma lo último que escribió cada docente vigente en ese mismo campo (cualquier materia o período, por `silabos.guardado_en`), siempre que la definición no haya cambiado. Si hay varios docentes, sus textos van uno debajo del otro, sin repetir.
- **Migración `20261125220000_formacion_como_campo`:** agrega el campo y la huella, pasa la formación que estaba en `usuarios` a los sílabos vivos (los enviados o aprobados toman la de su última versión enviada), llena las huellas y elimina `usuarios.formacion_experiencia_usuario`. No toca versiones, aprobaciones ni instantáneas.

---

## 5. API REST (`/api/v1`)

- **Formato:** JSON.
- **Autenticación:** cookie de sesión, más verificación del origen de la petición.
- **Respuestas:** 401 sin sesión, 403 sin permiso, 409 sin rol activo y 422 con errores de validación por campo.
- **Límites de intentos:** guardados en Redis, con las cabeceras `X-RateLimit-*`.
- **Documentación:** Swagger UI en `/api/docs` y el documento OpenAPI en `/api/docs-json` (puerto de la API). Muestra todas las rutas de la API.

**124 endpoints** en total.

| Área | Endpoints | Qué cubre |
|---|---|---|
| `authentication` | 11 | Ingreso y salida, activación de cuenta, recuperar y restablecer contraseña por correo, perfil, accesibilidad, sesiones abiertas |
| `session`, `active-role` | 2 | Sesión actual y cambio de rol o carrera activa |
| `admin` | 43 | Facultades, carreras y períodos (con importación desde Excel), usuarios y roles (con importación), procesos del período (abrir, pausar, reanudar, prórroga, impacto, finalizar), ajustes del sistema (correo, IA, catálogo, firmas), plantilla (estructura, campos, bloques, formato, logo, vista previa del docente, JSON) y asistente de IA |
| `coordination` | 35 | Malla (asignaturas, requisitos, disposición, configuración, importación), materias programadas, paralelos y asignación docente, docentes (con importación), convocatoria de la carrera, proyecto de carrera (ficha en Excel), revisiones (comparar versiones, pedir corrección, aprobar con firma), historial y documentos de apoyo |
| `teacher` | 12 | Mis sílabos (iniciar, guardar campo, validar, copiar desde otro paralelo, declaración de firma, enviar), historial, documentos de apoyo y búsqueda en el catálogo de Biblioteca |
| `library` | 5 | Revisiones de Biblioteca (observaciones y verificación con firma) e historial |
| `notifications` | 5 | Listado, marcar como leída, abrir y preferencias de correo |
| `revisions`, `exports` | 2 | Documentos generados por revisión y descarga del PDF |
| `academic` | 2 | Ficha académica de la asignatura y su vista previa |
| `dashboard`, `help` | 4 | Pasos «Antes de empezar», plazo del período y ayuda por pantalla |
| `support-documents` | 1 | Ver un documento de apoyo |

Rutas públicas fuera de la API: `/logos/institucion`, `/logos/facultad/:id`, `/images/silabo/:file` y `/plantilla.schema.json`.

**Listas paginadas:** 20 por página. Las de Usuarios, Coordinación y Biblioteca aceptan `sort` y `dir` con una lista de columnas permitidas.

---

## 6. Seguridad

- **Contraseñas:**
  - se guardan con bcrypt;
  - en producción piden al menos 12 caracteres, con mayúsculas, minúsculas, números y símbolos;
  - se rechazan las que aparecen en filtraciones conocidas. La consulta a *Have I Been Pwned* es anónima: solo se envían los 5 primeros caracteres del hash.
- **Sin verificación en dos pasos ni cambio de contraseña en Configuración:** el ingreso es con correo y contraseña (o la cuenta institucional). Quien olvida la contraseña la restablece con un enlace por correo.
- **Sesiones:**
  - en la base de datos, con cookie `HttpOnly`;
  - duración configurable (`SESSION_LIFETIME`; hoy 240 minutos, previsto bajar a 30);
  - sin «mantener sesión iniciada»;
  - se cierran todas al restablecer la contraseña.
- **CSRF y orígenes:** solo se aceptan peticiones desde los dominios configurados (`STATEFUL_DOMAINS`).
- **Permisos:**
  - por rol y por carrera, verificados en el servidor en cada endpoint;
  - un rol activo por sesión.
- **Límites de intentos** en el ingreso, la recuperación y las acciones sensibles, guardados en Redis.
- **Validación:** todas las entradas pasan por esquemas Zod en el servidor.
- **Firma digital:**
  - las aprobaciones se firman con el certificado **.p12** de cada persona;
  - el servidor verifica la firma (CMS), la vigencia y que el titular del certificado sea quien firma;
  - se puede exigir una lista de entidades certificadoras de confianza (`SIGNATURE_TRUSTED_CA_BUNDLE`).
- **Integridad:** cada versión enviada del sílabo guarda su **huella SHA-256**, y los documentos aprobados no se modifican.
- **Datos sensibles:** la clave de la IA se guarda cifrada (`APP_KEY`).
- **Datos personales (LOPDP):**
  - solo se guarda lo necesario: nombre, correo institucional y roles; la formación que declara el docente queda en sus sílabos;
  - los datos institucionales se leerán en modo de solo lectura.

---

## 7. Documentos del sílabo

1. **Instantánea:** al enviar, se congela el contenido en JSON canónico con su SHA-256.
2. **Word:** un generador en TypeScript arma el `.docx`. Produce el mismo resultado que la versión anterior hecha con PHPWord, comprobado con pruebas.
3. **PDF:** Gotenberg (LibreOffice) convierte el Word.
4. **Almacenamiento:** en disco (`STORAGE_PATH`), con registro en la tabla `archivos`.
5. Todo corre en el **worker**, así que la pantalla no espera.

---

## 8. Colas y trabajos en segundo plano

El worker es `apps/api/src/worker.ts`: un contexto de aplicación Nest (`WorkerModule`, con `QueueModule`) que arranca los trabajos registrados en `server/queue/registry.ts` y se detiene con `SIGINT`, `SIGTERM` o al cumplirse `QUEUE_MAX_TIME`. Se ejecuta desde la compilación de la API (`pnpm worker`).

**Colas (BullMQ sobre Redis):**

| Cola | Para qué |
|---|---|
| `critica` | Trabajos urgentes |
| `documentos` | Generación de documentos |
| `ia` | Asistente de IA |
| `general` | Correos y trabajos varios |

**Trabajos registrados:**

| Trabajo | Qué hace |
|---|---|
| Envío de correo | Activación, restablecimiento y avisos del flujo del sílabo, con plantillas React Email |
| Exportación del sílabo | Instantánea → Word → PDF |
| Vista de documento de apoyo | Convierte el documento subido (Word, Excel, etc.) a PDF con Gotenberg para verlo en el navegador |
| Asistente de la plantilla | Respuesta de la IA, con propuestas que Administración aplica o descarta |
| Prueba de plataforma | Comprueba que el worker y las colas funcionan |

---

## 9. Integraciones externas

| Servicio | Uso | Configuración |
|---|---|---|
| Gotenberg | Word → PDF | `GOTENBERG_URL` |
| SMTP | Notificaciones por correo | `MAIL_*` |
| DeepSeek (por el AI SDK) | Asistente de la plantilla. Con `AI_DRIVER=baseline` funciona sin IA externa | `AI_*` |
| Koha (OPAC) | Búsqueda en el catálogo de Biblioteca para la bibliografía | `CATALOG_DRIVER`, `KOHA_BASE_URL` |
| Sistemas académicos de la UEB | **Pendiente:** facultades, carreras, períodos, malla, paralelos y distributivo en solo lectura. Hoy se cargan a mano o desde Excel | Por definir con TICs |

---

## 10. Despliegue

**Docker Compose** (`compose.yaml`): un contenedor por servicio, con volúmenes con nombre para lo que debe persistir.

| Servicio | Imagen | Función |
|---|---|---|
| `postgres` | `postgres:18` | Base de datos; volumen `postgres` en `/var/lib/postgresql` |
| `redis` | `redis:7-alpine` | Colas, límites y bloqueos (`appendonly`); volumen `redis` |
| `minio` | `MINIO_IMAGE` (por defecto `pgsty/minio`) | Almacenamiento S3 de archivos; volumen `minio`; consola en `127.0.0.1:9001` |
| `minio-init` | `MINIO_MC_IMAGE` (por defecto `pgsty/mc`) | Crea el bucket `S3_BUCKET` (privado) con `mc` y termina |
| `gotenberg` | `gotenberg/gotenberg:8` | Conversión a PDF |
| `migrate` | `apps/api/Dockerfile` | Ejecuta `prisma migrate deploy` una vez y termina |
| `api` | `apps/api/Dockerfile` | API NestJS en el puerto 8000 |
| `worker` | `apps/api/Dockerfile` | La misma imagen de la API, con `node dist/apps/api/src/worker.js` |
| `web` | `apps/web/Dockerfile` | Next.js en modo `standalone`, puerto 3000; reenvía `/api`, `/logos` e `/images/silabo` a `http://api:8000` |

- **Orden de arranque:** `postgres`, `redis`, `minio` y `gotenberg` con chequeo de salud; `minio-init` espera a `minio`; `migrate` espera a `postgres`; `api` y `worker` esperan a que `migrate` y `minio-init` terminen bien; `web` espera a que la API esté sana.
- **Imágenes:** construcción en varias etapas sobre `node:24-bookworm-slim` (dependencias → build → ejecución) con pnpm y `prisma generate`; corren con el usuario `node`. La imagen de la API lleva los recursos públicos en `/app/assets` (`PUBLIC_ASSETS_PATH`).
- **MinIO:** las imágenes oficiales `minio/minio` y `minio/mc` ya no se pueden descargar sin cuenta (Docker Hub y quay.io responden «access denied»), por eso el archivo usa por defecto la bifurcación comunitaria `pgsty/minio`; con `MINIO_IMAGE` y `MINIO_MC_IMAGE` se usa la imagen que indique TICs.
- **Secretos:** `compose.yaml` no trae valores; los toma del archivo `.env` (plantilla en `.env.example`). Faltan `APP_KEY`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `S3_ACCESS_KEY` o `S3_SECRET_KEY` y Compose se detiene con un error. `S3_ACCESS_KEY` y `S3_SECRET_KEY` son también el usuario raíz de MinIO.

**Cómo levantarlo:**

```bash
cp .env.example .env        # completar los secretos
docker compose up -d --build
docker compose logs -f migrate api
```

Una base nueva se llena después con `docker compose run --rm api node_modules/.bin/tsx scripts/seed.ts`.

**Almacenamiento de archivos.** Logos (institución, facultades), documentos de apoyo y sus vistas PDF, y los PDF generados se guardan con el mismo esquema de rutas en los dos controladores: `private/...` y `public/...`.

- `STORAGE_DRIVER=local` (por defecto en desarrollo y pruebas): disco en `STORAGE_PATH`.
- `STORAGE_DRIVER=s3` (fijo en `compose.yaml`): bucket `S3_BUCKET` en `S3_ENDPOINT`, con las claves en el bucket iguales a las rutas en disco. Las descargas se leen en flujo y un archivo que falta responde igual que en disco (404 en las descargas, imagen por defecto en los logos).
- Los recursos públicos de solo lectura (`assets/images/silabo/*`) no van al bucket: se leen de `PUBLIC_ASSETS_PATH` (por defecto `assets/` en la raíz del repositorio).

**Migrar los archivos existentes a MinIO** (copia idempotente: omite los objetos que ya están con el mismo tamaño y ETag; `--dry-run` solo lista):

```bash
pnpm --filter @silabos/api storage:migrate -- --dry-run
pnpm --filter @silabos/api storage:migrate
# dentro de Docker, con la carpeta vieja montada en STORAGE_PATH:
docker compose run --rm -v /ruta/a/storage/app:/data/storage:ro api node_modules/.bin/tsx scripts/storage-migrate.ts --dry-run
```

Lee `STORAGE_PATH` (carpetas `private` y `public`) y usa las variables `S3_*`; escribe una línea JSON por archivo y un resumen (`uploaded`, `skipped`, `pending`, `bytes`).

**Variables de entorno** (solo los nombres; los valores van en el servidor, nunca en el repositorio):

| Grupo | Variables |
|---|---|
| Aplicación | `APP_ENV`, `APP_NAME`, `APP_KEY`, `APP_LOCALE`, `API_PORT`, `API_INTERNAL_URL`, `FRONTEND_URL`, `DISPLAY_TIMEZONE`, `TRUSTED_PROXIES`, `PUBLIC_ASSETS_PATH`, `POST_MAX_SIZE`, `WEB_PORT` |
| Autenticación | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SESSION_LIFETIME`, `SESSION_COOKIE_PREFIX`, `STATEFUL_DOMAINS`, `BCRYPT_ROUNDS` |
| Keycloak | `KEYCLOAK_ENABLED`, `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_REDIRECT_URI`, `KEYCLOAK_POST_LOGOUT_REDIRECT_URI` |
| Datos | `DATABASE_URL`, `REDIS_URL`, `REDIS_PREFIX`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| Archivos | `STORAGE_DRIVER`, `STORAGE_PATH`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `MINIO_IMAGE`, `MINIO_MC_IMAGE`, `MINIO_CONSOLE_PORT` |
| Colas | `QUEUE_MAX_TIME`, `QUEUE_RETRY_AFTER` |
| Servicios | `GOTENBERG_URL`, `MAIL_MAILER`, `MAIL_SCHEME`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` |
| IA y catálogo | `AI_DRIVER`, `AI_BASE_URL`, `AI_MODEL`, `AI_TEMPLATE_MODEL`, `AI_API_KEY`, `AI_CONNECT_TIMEOUT`, `AI_TIMEOUT`, `CATALOG_DRIVER`, `KOHA_BASE_URL` |
| Firma | `SIGNATURE_TRUSTED_CA_BUNDLE`, `SIGNATURE_REQUIRE_HOLDER_MATCH` |

---

## 11. Calidad

- **Pruebas unitarias e integración (Vitest):** unas 2 870 pruebas en los tres paquetes, sobre la lógica del servidor, la API, los componentes y las pantallas. Las rutas portadas a Nest tienen una prueba de equivalencia que compara, para los mismos datos, la respuesta del route handler anterior con la del controlador (estado, cuerpo, cabeceras y escrituras).
- **Pruebas de extremo a extremo (Playwright):** 86 pruebas que recorren el sistema en un navegador real con los cuatro roles. Cubren el ingreso y la recuperación de contraseña, el ciclo completo del sílabo con firmas y el PDF, la plantilla, la malla y los correos.
- **Revisión de tipos (TypeScript estricto) y lint (ESLint)** en cada cambio.
- **Accesibilidad y web moderna:**
  - guías *Modern Web Guidance* de Google Chrome, con objetivo Baseline 2024;
  - navegación con teclado, lectores de pantalla y movimiento reducido;
  - tema claro u oscuro según el sistema;
  - tablas ordenables;
  - diseño adaptable a celular.

---

## 12. Pendientes conocidos

- **Tareas programadas:** el sistema anterior (Laravel) las ejecutaba con su programador. Todavía no están en el stack actual:
  - resumen diario por correo, de lunes a viernes;
  - aviso de cierre próximo del plazo;
  - cierre automático de los procesos vencidos;
  - limpieza de enlaces de restablecimiento de contraseña.
- **Integración con los sistemas académicos de la UEB:** por definir con TICs.
- **Nombre institucional del proceso:** hoy se llama «convocatoria» y se evalúa cambiarlo según la revisión.
