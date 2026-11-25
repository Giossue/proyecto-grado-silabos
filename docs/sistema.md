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
| Framework web (interfaz y API) | Next.js (App Router, Turbopack) | 16.4 |
| Interfaz | React | 19.3 |
| Componentes | shadcn/ui sobre Radix UI, Tailwind CSS 4, íconos Lucide | — |
| Formularios y validación | react-hook-form + Zod (el mismo esquema en el cliente y el servidor) | 7.92 / 4.6 |
| Datos en el cliente | TanStack Query (caché, reintentos, invalidación) | 5.108 |
| Editor de plantilla y sílabo | Tiptap (ProseMirror) | 3.32 |
| Malla visual | React Flow (@xyflow/react) | 13 |
| Base de datos | PostgreSQL | 17 |
| ORM y migraciones | Drizzle ORM + drizzle-kit | 0.45 / 0.31 |
| Colas, límites y bloqueos | Redis + BullMQ (ioredis) | 7 / 6.7 |
| Autenticación | Better Auth (usuario y contraseña, 2FA TOTP) | 1.7 |
| Correos | Nodemailer + React Email | 10.6 |
| Word del sílabo | Generador propio en TypeScript + JSZip | — |
| PDF | Gotenberg (LibreOffice) | 8 |
| Excel (importaciones y ficha) | ExcelJS | 4.4 |
| Firma digital | node-forge, PKI.js, asn1js (verificación CMS de certificados .p12) | — |
| IA | Vercel AI SDK con DeepSeek | 7 |
| Pruebas | Vitest + Testing Library (unitarias) · Playwright (de extremo a extremo) | 5.1 / 1.65 |
| Contenedores | Docker y Docker Compose | — |

---

## 3. Arquitectura

```
 Navegador (React)
      │  HTTPS · cookie de sesión
      ▼
┌──────────────────────────────────────────────┐
│  Next.js (servicio «web»)                    │
│  · Páginas React (App Router)                │
│  · API REST /api/v1 (route handlers)         │
│  · Autenticación (Better Auth)               │
│  · Validación (Zod) y permisos por rol       │
└───────┬───────────────────┬──────────────────┘
        │                   │ encola trabajos
        ▼                   ▼
  ┌───────────┐       ┌───────────┐
  │PostgreSQL │       │  Redis    │  colas, límites de intentos y bloqueos
  └───────────┘       └─────┬─────┘
        ▲                   │
        │                   ▼
┌───────┴──────────────────────────────────────┐
│  Worker (servicio «worker», BullMQ)          │
│  · Genera Word → PDF (Gotenberg)             │
│  · Envía correos (SMTP)                      │
│  · Responde al asistente de IA (DeepSeek)    │
└──────────────────────────────────────────────┘

 Servicios externos: Gotenberg · SMTP · DeepSeek · Koha (catálogo de Biblioteca)
 Archivos (logos, PDF, documentos de apoyo): disco del servidor (STORAGE_PATH)
```

- **Un solo proyecto:** interfaz y API viven en la misma aplicación Next.js. El **worker** es el mismo código, ejecutado como un proceso aparte para el trabajo pesado o lento.
- **Organización del código** (`src/`):
  - `app/`: páginas por rol (`(shell)`, `(auth)`, `(editor)`, `(workspace)`) y la API (`app/api/v1`)
  - `components/`: componentes reutilizables (`ui/` de shadcn y `domain/` del negocio)
  - `server/`: lógica de negocio por módulo. Los módulos son: `academic`, `ai`, `auth`, `configuration` (plantilla), `dashboard`, `documents`, `excel`, `ficha`, `files`, `http`, `identity`, `library`, `mail`, `notifications`, `operations`, `queue`, `redis`, `signatures` y `syllabus`
  - `db/schema/`: esquema de la base (Drizzle)
  - `schemas/`: validaciones Zod compartidas entre el cliente y el servidor
  - `queries/`, `api/`: consultas y acceso a la API desde el cliente

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

- **Migraciones con Drizzle:** `pnpm db:migrate` crea la base desde cero y `pnpm db:seed` crea el administrador inicial y la plantilla oficial.
- **Integridad en la base:**
  - claves foráneas;
  - restricciones `CHECK` (estados, jornadas, rangos);
  - índices únicos;
  - una vista: `docentes_vigentes_silabo`.
- **Cada envío de sílabo** guarda una **instantánea** del contenido y su **SHA-256**. Lo aprobado no cambia.

---

## 5. API REST (`/api/v1`)

- **Formato:** JSON.
- **Autenticación:** cookie de sesión, más verificación del origen de la petición.
- **Respuestas:** 401 sin sesión, 403 sin permiso, 409 sin rol activo y 422 con errores de validación por campo.
- **Límites de intentos:** guardados en Redis, con las cabeceras `X-RateLimit-*`.

**130 endpoints** en total.

| Área | Endpoints | Qué cubre |
|---|---|---|
| `authentication` | 17 | Ingreso y salida, activación de cuenta, recuperar y restablecer contraseña, 2FA (activar, confirmar, códigos de recuperación, desafío), perfil, formación, accesibilidad, sesiones abiertas |
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
- **Verificación en dos pasos (TOTP):** con aplicación autenticadora y códigos de recuperación de un solo uso.
- **Sesiones:**
  - en la base de datos, con cookie `HttpOnly`;
  - duración configurable (`SESSION_LIFETIME`; hoy 240 minutos, previsto bajar a 30);
  - sin «mantener sesión iniciada»;
  - se cierran todas al cambiar o restablecer la contraseña.
- **CSRF y orígenes:** solo se aceptan peticiones desde los dominios configurados (`STATEFUL_DOMAINS`).
- **Permisos:**
  - por rol y por carrera, verificados en el servidor en cada endpoint;
  - un rol activo por sesión.
- **Límites de intentos** en el ingreso, la recuperación, el 2FA y las acciones sensibles, guardados en Redis.
- **Validación:** todas las entradas pasan por esquemas Zod en el servidor.
- **Firma digital:**
  - las aprobaciones se firman con el certificado **.p12** de cada persona;
  - el servidor verifica la firma (CMS), la vigencia y que el titular del certificado sea quien firma;
  - se puede exigir una lista de entidades certificadoras de confianza (`SIGNATURE_TRUSTED_CA_BUNDLE`).
- **Integridad:** cada versión enviada del sílabo guarda su **huella SHA-256**, y los documentos aprobados no se modifican.
- **Datos sensibles:** la clave de la IA y los secretos de 2FA se guardan cifrados (`APP_KEY`).
- **Datos personales (LOPDP):**
  - solo se guarda lo necesario: nombre, correo institucional, roles y formación declarada por el docente;
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

**Docker Compose** (`compose.yaml`):

| Servicio | Imagen |
|---|---|
| `web` | Next.js en modo `standalone` (imagen del `Dockerfile`), puerto 3000 |
| `worker` | El mismo código, ejecutando `pnpm worker` |
| `postgres` | `postgres:17`, con volumen persistente |
| `redis` | `redis:7-alpine`, con `appendonly` |
| `gotenberg` | `gotenberg/gotenberg:8` |

- **Imagen:** construcción en varias etapas (dependencias → build → ejecución) sobre `node:24-bookworm-slim`. Corre con un usuario sin privilegios.
- **Instalación de una base nueva:** `pnpm db:migrate` y luego `pnpm db:seed`.
- **Variables de entorno** (solo los nombres; los valores van en el servidor, nunca en el repositorio):

| Grupo | Variables |
|---|---|
| Aplicación | `APP_ENV`, `APP_NAME`, `APP_KEY`, `APP_LOCALE`, `FRONTEND_URL`, `DISPLAY_TIMEZONE`, `TRUSTED_PROXIES`, `PUBLIC_ASSETS_PATH`, `POST_MAX_SIZE` |
| Autenticación | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SESSION_LIFETIME`, `SESSION_COOKIE_PREFIX`, `STATEFUL_DOMAINS`, `BCRYPT_ROUNDS` |
| Datos | `DATABASE_URL`, `REDIS_URL`, `REDIS_PREFIX`, `STORAGE_PATH`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| Colas | `QUEUE_MAX_TIME`, `QUEUE_RETRY_AFTER` |
| Servicios | `GOTENBERG_URL`, `MAIL_MAILER`, `MAIL_SCHEME`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` |
| IA y catálogo | `AI_DRIVER`, `AI_BASE_URL`, `AI_MODEL`, `AI_TEMPLATE_MODEL`, `AI_API_KEY`, `AI_CONNECT_TIMEOUT`, `AI_TIMEOUT`, `CATALOG_DRIVER`, `KOHA_BASE_URL` |
| Firma | `SIGNATURE_TRUSTED_CA_BUNDLE`, `SIGNATURE_REQUIRE_HOLDER_MATCH` |

---

## 11. Calidad

- **Pruebas unitarias e integración (Vitest):** unas 2 850 pruebas, sobre la lógica del servidor, la API, los componentes y las pantallas.
- **Pruebas de extremo a extremo (Playwright):** 87 pruebas que recorren el sistema en un navegador real con los cuatro roles. Cubren el ingreso y el 2FA, el ciclo completo del sílabo con firmas y el PDF, la plantilla, la malla y los correos.
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
