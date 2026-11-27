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
6. Un **asistente de IA** ayuda a Administración a diseñar la plantilla. Otro, para el docente, lee lo que se le permite y, desde el panel «Asistente IA» de su sílabo, propone textos que el docente decide usar.

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
| Plantilla del sílabo | `plantilla_silabo`, `secciones_plantilla`, `campos_plantilla`, `definiciones_campo` |
| Proceso del período | `convocatorias_universidad` (institucional), `convocatorias_carreras` (por carrera) |
| Sílabos | `silabos`, `valores_campo`, `revisiones_silabo`, `envios_biblioteca`, `revisiones_coordinacion`, `aprobaciones`, `firmas_silabo` |
| Documentos | `exportaciones_silabo`, `archivos`, `documentos_apoyo` |
| IA | `sesiones_ia`, `mensajes_ia` |
| Sistema | `notificaciones`, `ajustes_sistema` |

- **Migraciones con Prisma:** el esquema está en `apps/api/prisma/schema.prisma` (sacado de la base con `prisma db pull`) y la migración base `0_baseline` reproduce el esquema completo, con funciones, triggers y la vista. `pnpm db:migrate` (`prisma migrate deploy`) crea una base desde cero y `pnpm db:seed` (`apps/api/scripts/seed.ts`, con Prisma) crea el administrador inicial con su cuenta de credenciales y la plantilla oficial; se puede repetir sin cambiar nada. La migración única de credenciales del sistema anterior a Better Auth (`db:migrate-auth`) ya se aplicó a `silabos_ueb` y se eliminó. En una base existente la migración base se marca como aplicada con `pnpm db:baseline`.
- **Integridad en la base:**
  - claves foráneas;
  - restricciones `CHECK` (estados, jornadas, rangos);
  - índices únicos;
  - una vista: `docentes_vigentes_silabo`;
  - las firmas quedan atadas a su versión con la clave foránea compuesta `firmas_silabo (revision_silabo_id, silabo_id)` → `revisiones_silabo`, así una firma no puede apuntar a una versión de otro sílabo;
  - los triggers `comprobar_coordinacion_activa_unica` y `comprobar_administrador_exclusivo` toman un bloqueo (`pg_advisory_xact_lock`) por carrera o por usuario antes de comprobar, así dos asignaciones simultáneas no pasan las dos.
- **Nombres en la base:** clave primaria `<tabla>_pkey`, clave foránea `<tabla>_<columnas>_fk`, único `<tabla>_<columnas>_unica`, índice `<tabla>_<columnas>_idx` y `CHECK` `<tabla>_<regla>_check`. Si el nombre pasa de 63 caracteres o el índice es parcial o de expresión, la parte del medio describe la regla (por ejemplo `asignaciones_rol_activa_unica`).
- **Auditoría:** las tablas que cambian tienen `creado_en` y `actualizado_en` (`timestamptz`, por omisión `now()`); `actualizado_en` lo pone el trigger `marcar_actualizado_en` en cada `UPDATE` que cambia la fila. Si la tabla ya tenía su fecha de creación (`asignado_en`, `subido_en`, `solicitado_en`, `creada_en`, `enviado_en`, `notificado_en`), solo se agregó `actualizado_en`; `ajustes_sistema` ya tenía `modificado_en` y solo recibió `creado_en`. No las tienen las tablas que no se modifican (`aprobaciones`, `firmas_silabo`, `revisiones_coordinacion`, `revisiones_silabo`, `envios_biblioteca`, `archivos`) ni las de Better Auth, que usan `created_at`/`updated_at`.
- **Cada envío de sílabo** guarda una **instantánea** del contenido y su **SHA-256**. Lo aprobado no cambia.
- **Formación del docente:** es el campo `formacion_docente` de la sección «Identificación» de la plantilla. Lo llena el docente en cada sílabo; la definición de la plantilla lo marca en `teacher_fields`, así que no aparece en el perfil de la asignatura de Coordinación ni en la ficha en Excel. En el Word y el PDF sale en la misma fila de la tabla de identificación (variable `formacion_docente`), no como bloque aparte. Es obligatorio para enviar.
- **JSON de la plantilla (forma corta):** «Plantilla como JSON» escribe todo el JSON en español, claves y valores: `politica_respuestas` (`protegida`), `documento`, `variables`, `tablas`, `secciones_obligatorias`, `secciones_biblioteca`, `campos_docente`, `contenidos_predefinidos` (`clave`, `etiqueta`, `campo`) y `secciones` (`clave`, `titulo`, `orientacion` `vertical`/`horizontal`, `campos` con `clave`, `etiqueta`, `quien_llena`, `contenido`, `mostrar_si` con `respuesta` y `opciones`, y `max_caracteres`). `documento` usa `papel` (`carta`, `a4`, `oficio`), `orientacion`, `margen_cm`, `letra`, `interlineado`, `espacio_parrafos_pt`, `tamaños` y `opciones` (`titulo`, `seccion`, `texto`), `colores` (`texto`, `titulo`, `fondo_encabezado_tabla`, `texto_encabezado_tabla`, `borde_tabla`, `texto_vacio`), `titulo` (`texto`, `negrita`, `cursiva`, `alineacion`), `titulo_seccion`, `texto` (`alineacion`: `izquierda`, `centro`, `derecha`, `justificado`), `encabezado` (`logos` con `fuente` `institucion`/`facultad` y `alto_pt`, `proporcion_izquierda`) y `texto_vacio`; cada variable lleva `etiqueta`, `fuente` (`identificacion.facultad`, `identificacion.horas_acd`, `aprobacion.coordinador`, `firma.docente`…), `ejemplo`, `formato` (`numero`) e `igual_a`. No se traducen `$schema`, los textos, el HTML, las claves de variables, secciones y campos ni los valores de `quien_llena`. La importación acepta también los nombres en inglés de los JSON anteriores (`document`, `sections`, `letter`, `portrait`, `identification.faculty`…) en cualquier mezcla, los traduce a la misma definición guardada (no cambia nada guardado ni hay migración) y, si el JSON viene en español, da los errores con las rutas en español (`secciones.0.clave`, `«documento.papel»: use carta, a4, oficio.`). Cada bloque de `tablas` va en forma corta: `titulo`, `campos`, `propiedades`, `reglas`, `catalogo` y `diseño`. Todo va en español. Cada dato se escribe con su tipo (`"texto"` hasta 1000 caracteres, `"texto largo"` en varias líneas, `"horas"` hasta 999.99 con 2 decimales, `"número"` cuando cambian `max` o `decimales`, `"sí/no"`, `opciones` como `{"clave": "Texto"}`), una lista con `filas` (`"1-8"`), `al_empezar` y `columnas`, y un grupo con `campos`; solo se escriben `titulo`, `error`, `solo_si`, `max`, `min` y `decimales` cuando no son el valor por defecto. Las reglas conocidas van por su nombre (`semanas_maximas`, `unidades_sin_nombre`, `unidades_sin_semanas`, `semanas_unidades_incompletas`, `horas_unidades_no_coinciden`, `libros_sin_titulo`, tomadas de `ruleCatalog.json`); una regla distinta va completa, y un dato que la forma corta no expresa va con su esquema completo (`type`). La lista de unidades se llama `unidades` (antes `units`) en el valor, en las rutas de las reglas (`unidades.*.semanas`) y en el diseño; la migración `20261126140000_lista_unidades` renombró la clave en `plantilla_silabo`, `definiciones_campo`, `valores_campo`, `propuestas_ia_plantilla` y `silabos`, y deja las revisiones enviadas con su propia definición y su huella. `catalogo.columnas` usa los nombres en español de los datos del libro (`autor`, `titulo`, `anio`, `ciudad`, `editorial`, `isbn`, `codigo`) y el sistema guarda los de Koha (`author`, `title`, `year`, `place`, `publisher`, `isbn`, `format`). La importación acepta la forma corta y la completa (los JSON exportados antes), también `units`, las claves de Koha en `catalogo.columnas` y `"número"` en las columnas de horas; las traduce a la misma definición guardada y da los errores con la ruta corta (`tablas.unidades.campos.unidades.filas: …`). La exportación solo usa la forma corta de un bloque si se importa igual que la completa; si no, lo deja completo. Los estilos de las tablas viven en `documento`: un encabezado sin fondo propio (`<th>Autor</th>`) toma `documento.colores.fondo_encabezado_tabla` y `texto_encabezado_tabla` en la vista previa, el PDF y el Word, y en Word también va en negrita; solo se escriben en `style="…"` los que difieren (alineación, otros colores, el encabezado azul y los de unidades con texto de color). La migración `20261126150000_estilos_en_documento` quitó el fondo y la negrita repetidos de los encabezados en `plantilla_silabo`, `definiciones_campo` y `valores_campo`; un JSON antiguo con esos estilos se importa igual y los conserva. Lo guardado, los sílabos, los documentos y el catálogo no cambian. Código: `apps/api/src/server/configuration/templateSpanish.ts`, `templateShortForm.ts` y `legacyUnits.ts`; esquema: `plantilla.schema.json`. La plantilla oficial (`officialTemplate.json`) está escrita en este mismo formato. Ya no se escribe `versión`: un JSON sin ella se importa como plantilla completa, y uno que la trae (2) sigue sirviendo.
- **Asistente de IA y tablas en forma corta:** `ver_plantilla` nombra cada tabla de un campo como `[tabla «Título», clave CLAVE]`; `ver_tabla` la muestra en la forma corta de la exportación (`shortBlock`, o completa si la corta no se importa igual), con las reglas por nombre y sin `diseño` cuando es la tabla dibujada estándar, y dice si `se_puede_cambiar`. `escribir_tabla` (`clave`, `tabla` como texto JSON) crea o reemplaza una tabla en forma corta o completa: sin `diseño` el sistema dibuja la tabla del editor con los títulos de las columnas (la lista y cada columna necesitan `titulo`), `defineAnyBlock` la convierte en la definición interna de siempre y `guardTable` rechaza al momento lo que el editor no puede rehacer (identificación, unidades, evaluación). Los errores vuelven a la IA en español con la ruta corta (`blocks.<clave>.reglas.0: «x» no es una regla conocida…`). `block_changes` de las propuestas sigue guardando la definición interna, así que las propuestas y el historial anteriores no cambian; `crear_tabla_repetible` sigue igual. El conocimiento (`templateKnowledge.json`) explica la forma corta y los ejemplos (`escenarios.json`) usan `<th>` sin estilo. El diseñador de tablas repetibles (`repeatableTable.ts`) escribe `<th>` sin estilo, que toma el color del encabezado de `documento`, y sigue leyendo como tabla del editor las guardadas con el estilo antiguo `background:#C3D4EA;font-weight:bold`. Código: `apps/api/src/server/ai/assistantDraft.ts` y `templateTools.ts`.
- **Pestaña «Diseño» del editor de la plantilla:** agrupa como Word todos los estilos de `documento` salvo los logos: Página (papel, orientación, márgenes), Fuente (letra y tamaños), Párrafo (interlineado, espacio entre párrafos, alineación del texto, texto vacío), Colores (texto, título, fondo y texto del encabezado de tabla, que pueden quedar sin color, borde de tabla y texto vacío) y Títulos (texto, negrita, cursiva y alineación del título; negrita, cursiva y alineación de los títulos de sección). Solo ofrece valores válidos: márgenes y tamaños salen de `documento.opciones`, el resto de las listas y rangos de `templateStyle.ts`. La hoja muestra cada cambio al momento. El borrador versión 1 del editor lleva esos estilos en `document` (sin margen, tamaños, encabezado ni opciones, que siguen en `layout` o fuera del editor); la API los mezcla con el `documento` actual con `documentWithStyles` y los valida igual que la importación del JSON, con errores en español. Un borrador versión 1 sin `document` (editores anteriores, asistente de IA) da la misma definición que antes. Código: `TemplateDesignTools.tsx`, `apps/web/src/lib/documentLayout.ts`, `apps/api/src/server/configuration/templateStyle.ts` y `templateDraft.ts`.
- **Campus y correquisitos del docente:** la base ya no guarda el campus de la facultad ni correquisitos (todo requisito de la malla es un prerrequisito de un ciclo anterior). Los campos `nombre_campus` y `correquisitos_asignatura` de la sección «Identificación» son campos del docente, como `formacion_docente`: están en `teacher_fields`, salen en la tabla de identificación (fuentes `identification.teacher_campus` y `identification.teacher_corequisites`) y el campus se arrastra del sílabo anterior del docente; los correquisitos no, porque dependen de la asignatura. Los sílabos creados antes conservan lo que mostraban.
- **Quién llena cada campo:** el editor de la plantilla ofrece en cada campo «¿Quién lo llena?»: «Nadie (texto fijo)» (`institucional`), «Coordinación» (`carrera`) o «Solo el docente» (`carrera` y la clave en `teacher_fields`; `campos_docente` en el JSON). La API de la plantilla marca esos campos con `teacher_only` y el borrador del editor envía la lista completa en `teacher_fields` (sin la lista se conserva la vigente; las propuestas del asistente no la cambian). En la plantilla oficial Coordinación llena los puntos 2, 3, 4, 5 y 7; solo el docente, los datos del punto 1 (con la tabla de identificación), 6, 9 (empieza con 4 filas vacías), 10 y la bibliografía básica y complementaria del 11; nadie, el punto 8, la verificación de bibliografía y las firmas. Cambiar el archivo oficial no cambia una plantilla ya guardada.
- **Lo que puede leer la IA del docente:** cada campo tiene en el editor de la plantilla un solo interruptor «La IA puede leerlo», junto a «¿Quién lo llena?». Se guarda al instante, sin «Guardar». La API admite cambiarlo con un periodo académico abierto, pero la pantalla solo ofrece el interruptor dentro del editor, que entonces está bloqueado: para cambiarlo desde la pantalla hay que pausar el periodo. El permiso vale para todos los sílabos y es la columna `campos_plantilla.lectura_ia_permitida`, fuera de la definición de la plantilla: cambiarlo no mueve `plantilla_silabo.plantilla_modificada_en` (el disparador `marcar_cambio_campo_plantilla` no mira esa columna), no toca sílabos ni avisa a nadie. Un campo nuevo empieza apagado. Editar, renombrar u ordenar un campo conserva su fila y su permiso, y quitarlo se lo lleva. Importar el JSON (así guarda el editor) y restablecer el formato oficial crean los campos otra vez con identificadores nuevos: la misma transacción lee antes qué claves tenían permiso y lo vuelve a poner en las que siguen. Vaciar la plantilla no deja ninguno. El editor manda en `new_fields` las claves de los campos creados en esa edición, para que uno nuevo que repite la clave de uno borrado no herede el permiso; en un JSON importado la clave es la única identidad.
- **Campos que la IA nunca lee:** el que contiene la tabla de identificación con estudiantes con discapacidad (la tabla `identificacion`, otra tabla cuyos campos pidan esos datos, valores `disability` guardados en una tabla o una tabla que la definición no conoce) y los de «Nadie (texto fijo)». No se pueden activar y el bloqueo se aplica también al leer, aunque exista el permiso. La función `aiReadableFields` (`apps/api/src/server/ai/readableFields.ts`) devuelve los campos legibles de la plantilla; que ese docente pueda editarlos en ese sílabo (`teacher_editable`) se combina aparte, y `holdsDisabilityData` aplica el mismo bloqueo a cualquier otro documento, como el valor guardado de un sílabo.
- **Valores iniciales:** al crear por primera vez la plantilla oficial (también con `pnpm db:seed`) y en la migración `20261127000000_permisos_ia_docente` para la plantilla existente, quedan activados los campos que llenan el docente o Coordinación, salvo «Formación y experiencia» (`formacion_docente`) y el de la tabla de identificación. Restablecer el formato oficial conserva los permisos de las claves que siguen y no activa ninguna otra.
- **Interruptor del asistente del docente:** en Configuración › Sistema, «Asistente del docente», apagado por omisión y sin contraseña. Se guarda en `ajustes_sistema` (`teacher_assistant.enabled`) y el servidor lo lee de la base con `teacherAssistantEnabledOn`. No cambia el asistente de la plantilla. El proveedor de IA no se configura ni se prueba en pantalla: la API y el worker lo toman de las variables `AI_*`. Las filas `ai.*` que una versión anterior de la pantalla haya guardado en `ajustes_sistema` se conservan y no se leen.
- **Asistente del docente, qué hace y qué ve:** es un asistente que investiga y recomienda, distinto del de la plantilla: no edita nada. Tiene sus propias instrucciones en español (`teacherPrompt.ts`) y un ciclo de herramientas: `leer_campos` (contenido actual y destinos de uno o varios campos) y `responder` (mensaje y hasta seis propuestas, cada una con su destino y en qué se basó). Para sumar otra herramienta de lectura se agrega a `TEACHER_TOOLS` (`teacherTools.ts`). Usa la misma pasarela, errores, reintentos y variables `AI_*` que el de la plantilla, y se detiene a los 8 pasos, 120 segundos o 3 errores seguidos. Cada pedido empieza solo con el nombre de la asignatura, sus horas, créditos y semanas, la lista (clave, sección y nombre) de los campos legibles y el texto del docente. Un campo es legible si tiene permiso (`aiReadableFields`), ese docente puede editarlo en ese sílabo (`teacher_editable`) y ninguna condición lo oculta; si su plantilla, su texto de Coordinación o lo guardado tienen datos de discapacidad, queda fuera. El contenido llega como texto (las tablas también) y toda variable del sistema se escribe como «[dato del sistema]»: nunca se resuelve ni se cargan nombres o correos. Cada texto pasa además por `holdsDisabilityData`. El proveedor recibe un seudónimo del docente (`doc-` y un HMAC con `APP_KEY`). Un texto de más de 20 000 caracteres se manda recortado y no admite reemplazo completo. Nombres escritos a mano dentro de un texto libre no se detectan. Código: `apps/api/src/server/ai/teacher*.ts`.
- **Asistente del docente, dónde propone:** solo texto, y solo en un campo que ya leyó (en un paso anterior). Destino `clave`: el campo entero, cuando el docente lo escribe completo (campo en blanco o texto propio, `teacher_edits`) y hoy no tiene tablas, bloques, respuestas ni datos del sistema, porque reemplazarlo los borraría. Destino `clave#n`: un espacio «Texto libre» visible y sin respuesta de la plantilla (también dentro de una celda) o una línea vacía fuera de tablas. Las celdas vacías, las filas nuevas y las tablas de unidades y bibliografía no admiten propuestas. Lo que devuelve el proveedor es texto plano: «- » y «1. » forman listas y no puede crear variables, formato ni otros nodos. Antes de ofrecerla, la propuesta pasa por las mismas reglas del guardado del sílabo (`draftDocument` y `draftLimitProblem` de `draftField.ts`, las que usa `PATCH teacher/syllabi/{id}/fields/{field}`: tablas protegidas, espacios y límites).
- **Asistente del docente, rutas:** `GET /teacher/syllabi/{syllabus}/assistant` responde `{ available: false }` con el interruptor apagado o sin proveedor configurado; si está disponible devuelve `limit`, `remaining`, `busy` y la conversación (los últimos 100 mensajes) con sus propuestas como texto; esta consulta no lee el sílabo. `POST .../messages` (`message` de hasta 4000 caracteres e `idempotency_key`) responde 202 y la pantalla consulta hasta que el mensaje deja de estar `pendiente` o `en_ejecucion`. No hay rutas para aplicar ni descartar: el asistente nunca escribe en el sílabo. Una propuesta nueva para el mismo destino deja la pendiente anterior como `reemplazada`. Las dos rutas exigen la misma regla de edición del guardado (403) y, para enviar, el asistente disponible (422 `assistant`). Cada propuesta se guarda dentro de su respuesta (`contenido_mensaje.propuestas`: `id`, `campo_id`, `destino`, `texto` y `fundamento`) y «reemplazada» no se escribe: se calcula al leer, cuando una respuesta posterior de la conversación propone para el mismo campo y espacio. Solo conservan un `estado` escrito las antiguas `aceptada` o `descartada`, de cuando la pantalla podía aplicarlas.
- **Asistente del docente, límites y conversación:** 20 pedidos por docente al día, sumando todos sus sílabos, con el limitador de Redis; el día es el de la zona de la aplicación (`DISPLAY_TIMEZONE`, por omisión `America/Guayaquil`) y se reinicia a la medianoche local (429 `limit`). Un pedido que falla también cuenta; repetir la misma `idempotency_key` no. Solo hay un pedido abierto por docente y sílabo (bloqueo `pg_advisory_xact_lock` y un índice único parcial); uno que siga abierto más de 15 minutos se da por fallido. El trabajo `AnswerTeacherAssistantJob` (cola `ia`) vuelve a comprobar el interruptor, el proveedor y la regla de edición antes de cada llamada, y lee los permisos y los campos al ejecutarse, no al pedir. La conversación es de un docente en un sílabo: otro docente del mismo sílabo empieza vacía. Se vuelven a enviar las últimas 6 respuestas completadas, y cada respuesta guarda en `contenido_mensaje.campos_enviados` las definiciones de campo que se enviaron para ella, incluidas las heredadas de la conversación: si una deja de ser legible (o se recrea al guardar la plantilla), ese turno completo y sus propuestas no vuelven al proveedor. Un campo que sigue siendo legible aunque cambie su texto conserva sus turnos. Con `AI_DRIVER=baseline` responde un simulador propio y determinista (`teacherGateway.ts`).
- **Asistente del docente, panel en el sílabo:** como en la plantilla de Administración, un botón flotante abajo a la derecha («Asistente» / «Cerrar asistente») abre un panel a un lado que no oscurece ni bloquea el sílabo. Solo sale con el sílabo iniciado y editable y la consulta en `available: true` (si se apaga con el panel abierto, el botón sigue hasta cerrarlo). En un sílabo que no se puede editar ni siquiera se consulta, y con el interruptor apagado la pantalla queda como antes y solo se hace esa consulta. Mientras `busy`, consulta cada 2,5 s y el botón lo indica; un 403 o un 404 detiene la consulta. El panel (título «Asistente IA») no lleva línea de aviso: el paso «Asistente» de la guía de la pantalla avisa que responde una IA externa (DeepSeek) y que no se escriban datos personales. Tiene hasta tres sugerencias, los pedidos que quedan, «Enviar», el límite, la espera e «Intentar de nuevo» en la última respuesta fallida; cada envío lleva una `idempotency_key` nueva. Al abrir y antes de enviar se guarda lo pendiente. Cada propuesta muestra su campo (o su espacio), el texto y un solo botón, «Copiar», que lo lleva al portapapeles tal cual y avisa si el navegador no lo permite; el docente lo pega donde quiera. El fundamento se guarda pero no se muestra. Respuestas y propuestas se pintan como texto (la respuesta, con `renderChatMarkdown`), nunca como HTML. Escape dentro del panel lo cierra y devuelve el foco al botón. Código: `TeacherSyllabusDetailPage.tsx`, `components/domain/ai/Teacher*.tsx`, `api/teacherAssistant.ts` y `queries/teacherAssistant.ts`.
- **Guías de cada pantalla:** «Ayuda de esta pantalla» abre una guía con `driver.js`. El texto sale de `screenHelpCatalog.json` (API) y los pasos que señalan botones, de `screenTours.ts` (web). Si la pantalla tiene pasos, del texto solo se muestra el primer párrafo, así que lo que la persona deba saber va en un paso. Un paso cuyo elemento no está visible se salta. Una prueba exige que toda pantalla con ayuda tenga pasos y que cada marca `data-tour` buscada exista.
- **Página no encontrada:** ocupa toda la pantalla, sin menú, barra ni botones flotantes. Una dirección que no existe usa `app/not-found.tsx`. Dentro de la aplicación, una pantalla cuyo registro no existe llama a `useMissingPage` (no a `notFound()` de Next, que lo dibuja dentro del menú) y `app/(shell)/layout.tsx` muestra ese mismo 404 en lugar de la aplicación.
- **Botones flotantes y formulario del docente:** la ayuda y la accesibilidad flotan siempre abajo a la izquierda del contenido (a la derecha del menú lateral cuando lo hay); la derecha queda para el asistente. «Antes de empezar» sigue abajo a la derecha. En el formulario del docente (`.teacher-form`, también en «Ver como docente») todas las tablas se ven igual, sean de un bloque, de un campo bloqueado o del editor de texto: mismas líneas, encabezado y celdas. Las tablas de un editor de texto quedan dentro de su cuadro, bajo la barra de formato. Los editores de texto empiezan bajos y se puede escribir pulsando en cualquier punto del cuadro. Mientras se usa un editor, la barra marca el formato del texto donde está el cursor (negrita, cursiva, subrayado y listas). Una tabla de bloque con más de 5 columnas de texto (bibliografía) usa columnas más angostas. Estos estilos no tocan el documento (`.template-sheet`), el PDF ni el Word.
- **Migración `20261127020000_permiso_ia_en_campos`:** agrega `campos_plantilla.lectura_ia_permitida` (apagada por omisión), copia en ella los permisos activos de los campos vigentes, limita `marcar_cambio_campo_plantilla` a las columnas que ya existían y borra la tabla `permisos_lectura_ia`. Conserva `plantilla_modificada_en` y los `actualizado_en`. Ya no se guarda quién cambió cada permiso (ese dato no se mostraba en ninguna parte). Una columna nueva en `campos_plantilla` que cambie la plantilla debe sumarse a la lista `UPDATE OF` de ese disparador.
- **Conversaciones con la IA, dos tablas:** el asistente del docente y el de la plantilla usan las mismas. `sesiones_ia` dice quién conversa y sobre qué (un sílabo o la plantilla, nunca los dos); `cerrada_en` marca un chat que ya no se muestra («Nuevo chat» de Administración cierra la sesión) y cada persona tiene a lo más una abierta por sílabo y una de la plantilla. `mensajes_ia` guarda cada pregunta y respuesta con `rol` (`usuario`, `asistente`), `estado` (`pendiente`, `en_ejecucion`, `completado`, `fallido`, porque la respuesta se prepara en segundo plano), `codigo_error`, `completado_en`, `clave_idempotencia` y `respuesta_a_id`; el texto, la traza, el uso y las propuestas van en `contenido_mensaje`. La base permite un solo mensaje abierto por conversación y no repite la clave dentro de ella; el asistente de la plantilla además reconoce una clave ya usada en un chat cerrado. Las conversaciones se borran en cascada al eliminar el sílabo, también cuando se reinicia o se rehace (ambos eliminan el sílabo anterior), y al eliminar al usuario. Adaptar un sílabo a otra plantilla conserva las filas, y sus propuestas siguen en la conversación como texto, también si su campo se borra de la plantilla. «Nuevo chat» toma el mismo bloqueo que el envío de un pedido, así que uno que se esté enviando nunca queda oculto. Código: `sessionStore.ts`, `teacherAssistantStore.ts` y `assistantStore.ts`.
- **Propuestas del asistente de la plantilla:** cada respuesta tiene a lo más una, en `contenido_mensaje.propuesta` (`id`, `estructura`, `cambios`, `huella_plantilla_base`, `version_borrador`, `estado`, `creada_en` y, al decidirla, `decidida_por` y `decidida_en`). Los estados son `pendiente`, `aplicada`, `descartada`, `vencida` y `reemplazada`; los escribe solo `assistantStore.ts` (la base ya no los comprueba) y `mensajes_ia_propuesta_unica` impide repetir el identificador. El repositorio arma el mensaje completo al leer y lo separa al escribir, así que las respuestas de la API no cambiaron.
- **Migraciones `20261127010000_asistente_docente` y `20261127030000_sesiones_y_mensajes_ia`:** la primera creó las tablas propias del docente; la segunda crea `sesiones_ia` y `mensajes_ia`, traslada las conversaciones del docente con sus propuestas y campos enviados dentro del contenido, aborta si no coinciden las cantidades y solo entonces borra `mensajes_ia_docente` y `propuestas_ia_docente`.
- **Migración `20261127040000_asistente_plantilla_en_sesiones_ia`:** traslada las conversaciones del asistente de la plantilla: los mensajes visibles quedan en una sesión abierta y cada chat borrado con «Nuevo chat» en una sesión cerrada con esa fecha, con sus propuestas dentro de la respuesta y los mismos identificadores. Si una conversación tuviera más de un pedido abierto, deja abierto el último y da por fallidos los anteriores. Aborta si no coinciden las cantidades o si una propuesta no es de quien envió su mensaje, y solo entonces borra `mensajes_ia_plantilla` y `propuestas_ia_plantilla`.
- **Texto del docente al cambiar la plantilla o el proyecto de carrera:** no se bloquea el cambio. Los sílabos afectados se adaptan (los enviados o aprobados vuelven a borrador) y el texto del docente se conserva mientras tenga dónde ir; corregir el texto de un encabezado lo conserva. Si la estructura cambió (por ejemplo, columnas agregadas o quitadas, o un campo que cambia de responsable), lo que no quepa se reemplaza por la plantilla nueva; al reordenar columnas puede quedar bajo otro encabezado. Si el servidor reescribe valores de un borrador sin cambiar su estado, sube `version_borrador` y un guardado atrasado recibe el conflicto de versión.
- **PDF, cuadros de firma:** en el Word del que sale el PDF, toda tabla que contiene una variable de firma electrónica (`signature.*`) se mantiene entera en una página junto con el título que la precede (filas sin partir y párrafos unidos a la fila siguiente). Las demás tablas siguen repartiendo sus filas entre páginas. La ayuda por pantalla, las guías, el conocimiento del asistente y los errores de la plantilla usan los nombres de «¿Quién lo llena?». Al actualizar un documento de apoyo, si falla el borrado del archivo anterior se registra un aviso y la vista nueva se encola igual; un fallo posterior a la confirmación no borra el archivo ya guardado.
- **Campo «Solo el docente»:** no aparece en el proyecto de carrera ni en su Excel, no cuenta como «Sin definir» y un valor antiguo del proyecto de carrera no se usa ni se borra. El docente recibe el contenido de la plantilla. Un texto con contenido propio se edita entero en el editor con formato (`teacher_edits`), sin aviso ni botón para restaurar y sin límite de caracteres; vacío, lo escribe como siempre; con tabla de datos (unidades, bibliografía, identificación) o con espacios de respuesta puestos por Administración sigue con sus formularios. En un texto, una tabla con filas de encabezado y debajo solo filas vacías iguales (aunque sean varias) admite agregar y quitar filas, nunca menos de una; columnas y encabezados quedan fijos, y si sigue vacía no se puede enviar. Solo lo que el docente no tocó sigue a la plantilla. Lo que el sílabo ya tenía (propio, venido del proyecto de carrera o con marcas antiguas) se conserva como texto del docente al mostrarlo, validarlo, adaptarlo a una plantilla nueva (también en un sílabo sin abrir que se rehace), copiarlo de otro paralelo y heredarlo; las respuestas que había contestado quedan como texto. Entre sílabos del docente solo se arrastran los campos que empiezan vacíos (formación y campus), nunca tablas ni textos de la materia. Código: `teacherText.ts` (`writtenValue`), `templatePresentation.ts` (`teacherTemplate`), `subjectProfileFields.ts`, `inProgressWork.ts`.
- **Proyecto de carrera, campo de Coordinación en el editor:** en el proyecto de carrera cada campo de Coordinación se abre como un solo editor con todo su contenido (lo guardado de la materia o, si no hay, el de la plantilla), y Coordinación cambia ahí el texto y pone los espacios del docente. Las tablas de la plantilla quedan protegidas: el editor y el servidor no dejan quitarlas, agregar o quitar columnas ni combinar celdas; solo se escribe dentro de sus celdas. Una tabla «admite filas» cuando en la plantilla de Administración tiene solo filas de encabezado y, debajo, una única fila de respuesta sin combinar hacia abajo (`listTable`): en ella Coordinación agrega y quita filas («Agregar fila» y «Quitar fila», nunca menos de una; la fila nueva copia la de la plantilla) y, si escribe en la tabla, queda con filas fijas para el docente, que llena las celdas vacías. Si al guardar todas sus filas siguen vacías, el servidor deja una sola. Las tablas de filas fijas no admiten agregar ni quitar filas. En un campo con tabla, las opciones del engranaje (también «Texto libre») no reemplazan nada: el espacio va dentro de la celda vacía donde está el cursor y, si el cursor no está en una, la pantalla lo explica; en un campo sin tabla, «Texto libre» sigue dejando todo el campo al docente. Los encabezados tampoco se cambian: el editor no deja escribir ni borrar en ellos, el servidor rechaza guardarlos distintos y, al leer una copia ya guardada, toma los de la plantilla. El servidor (`careerResponse`) acepta el texto editado pero no deja agregar ni quitar bloques ni datos del sistema nuevos, ni quitar una respuesta o una opción que use una condición (`keepsUsedResponses`, `keepsUsedOptions`); las respuestas de la plantilla se reconocen por tipo, ajustes, `id` y `showIf`. Si Coordinación cambió el texto, el servidor guarda el valor marcado como copia editada (`attrs.edited`, que solo pone el servidor y no llega al docente ni al PDF) y esa versión se conserva aunque Administración cambie después el texto de la plantilla; un valor sin marca (solo espacios llenados, incluidos los anteriores) sigue la plantilla actual con lo llenado pasado por respuesta y por posición. La versión de la materia llega al docente como texto fijo con sus espacios abiertos, y las respuestas del docente pasan a la versión nueva por respuesta (`fieldCarried`) aunque cambie el texto alrededor. Una línea vacía dentro del texto es un espacio para el docente, igual que en la plantilla; las líneas vacías sobrantes al final se quitan.
- **Campo entero para el docente:** cuando lo que recibe el docente es solo un espacio «Texto libre» sin límite propio, sin condición y no opcional (`openShape`), se le entrega como campo en blanco y escribe con el editor con formato. Lo respondido antes en la caja simple se lee como párrafos (`writtenValue`), sin migración. Los espacios dentro de una frase o de una celda siguen siendo respuestas simples.
- **Documentos de apoyo, actualizar:** `POST coordination/support-documents/{document}` (multipart: `title` obligatorio y `file` opcional; mismos límites que al subir, 20 por minuto, solo Coordinación de esa carrera). Sin archivo cambia solo el nombre. Con archivo lo guarda en `documentos-apoyo/<carrera>/<documento>/<archivo>/`, borra el anterior después de confirmar la transacción y, si no es PDF, vuelve a preparar la vista. El trabajo de la vista queda ligado a su archivo (`originalId`), así uno anterior no pisa al nuevo. `subido_en` y `subido_por` pasan a ser los del último cambio; la pantalla los muestra como «Actualizado».
- **Proyecto de carrera, tipos del engranaje y marcas antiguas:** el engranaje ofrece «Texto libre» y «Elegir varias»; «Elegir una» solo aparece en un espacio que ya se guardó así, que sigue funcionando. El proyecto de carrera ya no tiene casillas. Los valores guardados antes con `attrs.teacherEdits` (el docente edita ese texto en su sílabo; su texto lleva `attrs.ownText`, que solo pone el servidor) o `attrs.teacherFills` (tabla vacía que llena el docente) siguen funcionando igual: cuentan como definidos y se conservan al guardar y al importar Excel. La marca se descarta sola si deja de aplicar (se agrega un espacio de respuesta o se escribe en la tabla). Código: `teacherText.ts`, `templateRuntime.ts`, `apps/web/src/lib/teacherEdits.ts`.
- **Proyecto de carrera, campos definidos:** cada campo de Carrera de cada materia que genera sílabo debe quedar definido por Coordinación. Un campo está definido cuando tiene texto propio, una marca antigua vigente o un tipo de respuesta («Texto libre», «Elegir una» o «Elegir varias»), puesto por Coordinación o ya por Administración en la plantilla; dejar líneas o espacios en blanco no cuenta. Una elección sin opciones sigue pendiente. La regla es `careerFieldUndecided` (paquete compartido): la pantalla marca esos campos como «Sin definir», el avance de la materia los descuenta y, mientras quede alguno, no se puede abrir el periodo académico de la carrera (solo al abrirlo: reanudar uno pausado no lo exige). Si un sílabo de un periodo ya abierto tiene un campo de Carrera vacío, lo sigue escribiendo el docente y es obligatorio para enviar.
- **Proyecto de carrera, antes y con el periodo abierto:** Coordinación guarda el proyecto de carrera e importa su Excel (descargar, revisar y aplicar) según el proceso de la universidad más reciente por su período (`careerProfileEditable`): sin ningún proceso, se puede (primera preparación); con el proceso «pausado» o «cerrado», no; con el proceso «abierto», se puede si la convocatoria de la carrera en ese proceso no existe o está en «preparacion» o «abierto», y no si está «pausado» o «cerrado». Bloqueado, el servidor responde 422 `process` «El proyecto de carrera no se puede editar con el periodo académico en pausa o finalizado.» y la pantalla queda de solo lectura con ese motivo (`lock_reason` en la ficha, `career.profile_lock_reason` en materias programadas, que deshabilita «Importar desde Excel»). Administración no tiene esta restricción. Los campos «Sin definir» siguen impidiendo abrir el periodo académico de la carrera. La malla y los demás datos académicos siguen con su regla («Periodo académico activo»).
- **Excel del proyecto de carrera y lo que responde el docente:** el Excel solo escribe texto. Si al importar un campo se quitaría un espacio de respuesta ya guardado en la materia («Texto libre», «Elegir una» o «Elegir varias»), la vista previa lo marca (`removed_answers` en cada materia: por clave de campo, cada espacio que se quitaría con su tipo `texto`, `una` o `varias` y sus opciones), lo cuenta como reemplazo y la pantalla lo deja sin marcar; se reemplaza solo si la persona marca ese campo. El cálculo usa los mismos pasos que «Aplicar», así que no avisa cuando la importación conserva el espacio. La API aplica los campos que reciba: dejarlo sin marcar es trabajo de la pantalla. Código: `server/ficha/fichaImports.ts` y `FichaImportDialog.tsx`.
- **Docente sin activar su cuenta:** Coordinación y Administración le asignan paralelos aunque todavía no haya activado la cuenta; cuenta como docente de la carrera y no impide abrir el periodo académico. Para entrar sigue necesitando activar la cuenta desde su correo. Un docente «Inactivo» o con la cuenta deshabilitada no recibe paralelos.
- **Resumen diario de pendientes:** docentes, Coordinación y Biblioteca no reciben un correo por cada sílabo o cambio. De lunes a viernes, a la «Hora del resumen» del sistema (08:00 por omisión), cada persona con algo pendiente en un periodo abierto y dentro de la fecha de entrega (una prórroga la mueve; vencida, no se envía a ningún rol) recibe un solo correo que dice que tiene pendientes. Docente: sílabos sin iniciar, en borrador o con corrección solicitada (también si aún no activó la cuenta). Coordinación: sílabos de su carrera por aprobar. Biblioteca: envíos por revisar. Lo envía el worker (revisa cada minuto; si estaba apagado, envía hasta 4 horas después). Los avisos dentro del sistema y los correos de activación y contraseña no cambian. `NOTIFICATION_EMAIL_EVENTS` permite volver a activar correos de eventos concretos.
- **Carreras con varias mallas:** una carrera puede tener varias mallas (tabla `mallas`: código, número de ciclos y estado `vigente` o `cerrada`; puede haber varias `vigente` a la vez). El código de la malla es único dentro de la carrera, con las mismas reglas que los códigos de carrera y de asignatura; donde se muestra una malla se lee «Malla <código>» («Malla SW-8»). Al crear una carrera, su primera malla toma el código de la carrera. Cada asignatura pertenece a una malla (`asignaturas.malla_id`; `carrera_id` se conserva como copia amarrada con una clave foránea compuesta) y su código es único dentro de la malla. La pantalla de malla elige la malla y la gestiona: al crearla se piden el código y los ciclos, y siempre nace `vigente`; al editarla, el botón «Editar malla» cambia el código, los ciclos y el estado. Hacer vigente una malla (nueva o una cerrada que se reabre) no cambia las demás, y cerrarla es siempre manual: no se puede cerrar una malla con sílabos en un periodo abierto. Los periodos generan sílabos con las asignaturas de todas las mallas vigentes; cada sílabo guarda su malla (`curriculum` en el contexto académico, con el nombre «Malla <código>»; fuente de plantilla `identification.curriculum`). Una «doble malla» ya no es otra carrera: `apps/api/scripts/fusionar-carreras.sql` fusiona dos carreras (`psql -v keep=… -v absorb=…`); las mallas absorbidas conservan su estado.
- **Una malla a la vez:** la pantalla de malla, «Materias y asignaciones» y la pestaña «Materias» de «Proyecto de carrera por materia» (en Coordinación y en las vistas de carrera de Administración) usan el mismo desplegable (`MallaToolbar`) y la misma regla para la malla inicial (`shownMalla`: la primera de la lista de la API, que ordena las vigentes primero y por código). «Nueva malla» solo está en la pantalla de malla, en la vista y en el editor. «Materias y asignaciones» y «Proyecto de carrera» solo ofrecen mallas que no están cerradas, porque la API no envía las materias de una cerrada; sin ninguna, no hay desplegable y la pantalla lo dice. Las materias se reparten por `malla_name` («Malla <código>»). En «Materias y asignaciones», al cambiar de malla se quitan la búsqueda, los filtros y lo marcado, y las acciones en lote solo alcanzan materias de la malla que se ve; la elección dura mientras la pantalla está abierta. En «Proyecto de carrera», la malla elegida va en la dirección (`?malla=<código>`), así se conserva al abrir una materia y volver; un código que no está entre las ofrecidas abre la inicial, y «Cambiar de materia» solo ofrece las materias de la misma malla. La pestaña «Documentos de apoyo» no muestra el desplegable.
- **Código del paralelo:** en «Paralelos y docentes de la materia» se elige de un desplegable, al agregar y al editar, con las letras de la A a la Z que ningún otro paralelo de esa asignatura usa (sin distinguir mayúsculas, como el índice único `paralelos_asignatura_codigo_unica`). Un código guardado que no esté entre esas letras («B1», «a») encabeza la lista tal como está escrito y no cambia si no se elige otro. La API, la importación y las acciones en lote no cambian: la API sigue admitiendo códigos de hasta 30 caracteres.
- **Guardar la malla:** en el editor de la malla, mover una materia (arrastrando o desde su menú) y unir dos materias como prerrequisito no se guarda al momento: queda pendiente (la línea nueva se ve discontinua) hasta pulsar «Guardar cambios»; «Descartar» vuelve a lo guardado. Al salir del editor, pasar a otra malla con el desplegable (que también está en el editor), cerrar o recargar la página con cambios pendientes se pide confirmación; cambiar de malla nunca guarda, mueve ni copia nada entre ellas, y el desplegable se deshabilita mientras se guarda. Una malla creada desde el editor se abre después de crearla, con la misma confirmación si hay algo pendiente. Los diálogos con su propio botón (agregar, editar o eliminar una materia, eliminar un prerrequisito guardado, datos de la malla) siguen guardando al confirmar. El guardado usa las mismas rutas, una llamada por cambio: no es atómico, y si una falla lo ya guardado se queda y lo demás sigue pendiente (`useCurriculumDraft`).
- **Medidas de la malla:** las filas crecen con el «Tamaño del texto» de accesibilidad y cada materia queda centrada en su fila (`canvasMetrics` en `curriculumCanvasLayout.ts`); las relaciones se dibujan por el hueco real entre tarjetas.
- **Direcciones con códigos:** las páginas de una carrera o de una materia usan códigos, no identificadores: `/admin/carreras/<carrera>/{malla,materias-asignaciones,docentes,proyecto-carrera}`, `/admin/carreras/<carrera>/proyecto-carrera/<malla>/<materia>`, `/coordinacion/proyecto-carrera/<malla>/<materia>` y `/docente/historial/<carrera>` (el código de materia solo es único dentro de su malla); sílabos y revisiones no cambian. La API sigue usando sus identificadores: la pantalla busca el código (`useCodeLookup`) en una lista que el rol ya puede leer (Administración en `/admin/academic`, el proyecto de carrera en `scheduled-subjects`, que envía `malla_code`, y el historial en `/teacher/history`, que envía `code`), muestra su esqueleto mientras carga y, una vez abierta, no se cierra si la lista cambia. Un código que no está en la lista actualizada, y cualquier enlace antiguo, da «Página no encontrada», sin redirecciones; por eso tampoco se abren por dirección las materias que la lista no trae (inactivas o de una malla cerrada). Los códigos de carrera, malla y materia solo admiten letras sin tilde, números y guiones simples (`CODE_PATTERN`, `^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$`) en los formularios, la API y las importaciones de Excel. En el menú lateral, `/admin/carreras/…` cuenta como «Facultades y carreras». En la dirección los códigos van en minúsculas (se comparan sin distinguir mayúsculas), y por eso no pueden existir dos códigos que solo difieran en mayúsculas.
- **Arrastre entre sílabos:** cada valor guarda en `valores_campo.huella_definicion_campo` el SHA-256 de la definición del campo con la que se escribió. Al generar o iniciar un sílabo, si un campo del docente está vacío, toma lo último que escribió cada docente vigente en ese mismo campo (cualquier materia o período, por `silabos.guardado_en`), siempre que la definición no haya cambiado. Si hay varios docentes, sus textos van uno debajo del otro, sin repetir.
- **Estado al abrir un sílabo:** al abrirlo por primera vez, la API (`POST /teacher/syllabi/{id}/start`) lo prepara: copia lo del período anterior, arrastra los campos del docente y fija `silabos.iniciado_en`, pero lo deja en `sin_iniciar`. Pasa a `borrador` con el primer guardado de un campo que cambia lo guardado (o con «Copiar desde otro paralelo»); guardar el mismo valor no lo cambia. Un sílabo `sin_iniciar` con `iniciado_en` ya se puede editar, validar y enviar, y para el resto del sistema (plantilla nueva, cambio de docente al reabrir, copiar desde otro paralelo, protección al eliminar) cuenta como empezado.
- **Migración `20261125220000_formacion_como_campo`:** agrega el campo y la huella, pasa la formación que estaba en `usuarios` a los sílabos vivos (los enviados o aprobados toman la de su última versión enviada), llena las huellas y elimina `usuarios.formacion_experiencia_usuario`. No toca versiones, aprobaciones ni instantáneas.
- **Migraciones `20261126010000_limpiar_restos_y_relaciones`, `20261126010100_nombres_uniformes` y `20261126010200_auditoria_y_bloqueos`:** la primera borra lo que quedaba del sistema anterior (tabla `sesiones`, `usuarios.codigo_recordarme`, esquema `drizzle`), las sesiones y verificaciones vencidas, las claves foráneas repetidas de `campos_plantilla` y `definiciones_campo` (quedan las compuestas, con `RESTRICT`, que era lo que ya se aplicaba) y tres índices redundantes, y agrega la clave compuesta de las firmas y los índices de `notificaciones.periodo_academico_id` y `sesiones_usuario.active_role_assignment_id`; la segunda solo cambia nombres de restricciones, índices y de la función `impedir_cambio_periodo_con_convocatorias_carrera`; la tercera agrega los bloqueos y las columnas de auditoría. Las filas que ya existían quedaron con `creado_en` y `actualizado_en` iguales a la fecha de la migración, no a su fecha real.
- **Contraseña:** el hash vive solo en `cuentas_usuario.password` (la cuenta `credential` de Better Auth). Crear una cuenta, activarla, restablecer la contraseña y el seed escriben ahí; `usuarios` no guarda contraseña.
- **Formulario de las tablas de la plantilla (unidades, bibliografía, discapacidad):** el orden de campos y columnas sale del diseño de cada tabla (`diseño`) y no del orden de las claves guardadas (`packages/shared/src/lib/blocks/order.ts`). La migración `20261126150000_estilos_en_documento` pasó la definición de la plantilla por `jsonb` y dejó las claves reordenadas. `plantilla_silabo.definicion_plantilla` es `json` para conservar el orden: al reescribirla en una migración no la pases por `jsonb`. El constructor visual de tablas y «Plantilla como JSON» todavía leen el orden guardado.
- **Horas en el formulario de unidades:** arriba de las unidades, un contador fijo «Horas de la asignatura» muestra por componente (ACD, APE, AA) cuántas horas suman todas las unidades, cuántas tiene la asignatura y cuántas faltan o sobran; cada unidad suma las suyas en la fila «Total de horas» de su tabla. Sale de las comprobaciones de envío que comparan una suma con un dato del sistema (`sumBudgets` en `packages/shared/src/lib/blocks/rules.ts`), así que usa la misma suma que la regla `horas_unidades_no_coinciden`. Solo avisa: se puede seguir escribiendo aunque sobren horas y lo que impide enviar es la regla. No muestra un componente en 0 de 0; sin el dato de la asignatura muestra solo las horas usadas. En teléfono la cabecera de la aplicación va abajo y el contador se fija bajo el aviso de plazo, cuya altura publica `AppSidebarLayout` en `--app-banner-height`.
- **Total de horas de una asignatura:** no se guarda. Se calcula al mostrar con la misma regla de la antigua columna generada: `horas_docencia + horas_practicas + horas_autonomas` (las vacías cuentan como 0), redondeado al entero (las mitades hacia arriba). Lo usan la malla, el contexto académico de la asignatura (`subject.total_hours`, que alimenta `identification.total_hours` de los sílabos nuevos; las instantáneas ya guardadas no cambian) y la validación de las horas. La importación de la malla en Excel no tiene columna de total: lo calcula.
- **Migraciones `20261126020000_contrasena_solo_en_cuenta`, `20261126020100_estado_mensajes_ia_en_columnas` y `20261126020200_total_horas_calculado`:** la primera aborta si algún usuario no tiene cuenta `credential` con contraseña y luego borra `usuarios.contrasena`; la segunda agrega las columnas de estado de los mensajes de IA, las llena desde el JSON, quita esas claves del JSON (sin tocar `actualizado_en`), cambia el `CHECK` del contenido y rehace el índice de idempotencia sobre la columna; la tercera aborta si algún total guardado difiere de la suma redondeada y borra `asignaturas.total_horas_asignatura`.
- **Migraciones `20261126000000_quitar_campus_y_correquisitos` y `20261126000100_campus_y_correquisitos_como_campo`:** la primera borra los correquisitos y quita `requisitos_asignatura.tipo_requisito_asignatura` y `facultades.campus_facultad`; la segunda cambia las fuentes en las plantillas guardadas, agrega los dos campos del docente y los llena en los sílabos existentes con lo que ya mostraban (los enviados o aprobados, con su última versión enviada).

---

## 5. API REST (`/api/v1`)

- **Formato:** JSON.
- **Autenticación:** cookie de sesión, más verificación del origen de la petición.
- **Respuestas:** 401 sin sesión, 403 sin permiso, 409 sin rol activo y 422 con errores de validación por campo.
- **Límites de intentos:** guardados en Redis, con las cabeceras `X-RateLimit-*`.
- **Documentación:** Swagger UI en `/api/docs` y el documento OpenAPI en `/api/docs-json` (puerto de la API). Muestra todas las rutas de la API.

**190 endpoints** en `/api/v1`.

| Área | Endpoints | Qué cubre |
|---|---|---|
| `authentication` | 8 | Ingreso y salida, activación de cuenta, recuperar y restablecer contraseña por correo y perfil |
| `session`, `active-role` | 3 | Sesión actual y cambio de rol o carrera activa |
| `admin` | 65 | Facultades, carreras y períodos (con importación desde Excel), usuarios y roles (con importación), procesos del período (abrir, pausar, reanudar, prórroga, impacto, finalizar), ajustes del sistema (correo, catálogo, firmas y el interruptor del asistente del docente), plantilla (estructura, campos, bloques, formato, logo, vista previa del docente, JSON y lo que puede leer la IA: `GET /admin/template/{template}/ai-permissions` y `PUT /admin/template/{template}/ai-permissions/{field}`) y asistente de IA |
| `admin/careers/:career` | 31 | Las mismas rutas de malla, materias programadas, paralelos, asignación docente, docentes y proyecto de carrera de `coordination`, para la carrera indicada. Solo Administración; no incluyen revisar ni aprobar sílabos |
| `coordination` | 47 | Malla (asignaturas, requisitos, disposición, configuración, importación), materias programadas, paralelos y asignación docente, docentes (con importación), periodo académico de la carrera, proyecto de carrera (ficha en Excel), revisiones (comparar versiones, pedir corrección, aprobar con firma), historial y documentos de apoyo |
| `teacher` | 14 | Mis sílabos (iniciar, guardar campo, validar, copiar desde otro paralelo, declaración de firma, enviar), historial, documentos de apoyo, búsqueda en el catálogo de Biblioteca y el asistente del docente (conversación y disponibilidad, enviar un pedido, aceptar y descartar una propuesta) |
| `library` | 5 | Revisiones de Biblioteca (observaciones y verificación con firma) e historial |
| `notifications` | 6 | Listado, marcar como leída, abrir y preferencias de correo |
| `revisions`, `exports` | 3 | Documentos generados por revisión y descarga del PDF |
| `academic` | 3 | Ficha académica de la asignatura y su vista previa |
| `dashboard`, `help` | 4 | Pasos «Antes de empezar», plazo del período y ayuda por pantalla |
| `support-documents` | 1 | Ver un documento de apoyo |

Rutas públicas fuera de la API: `/logos/institucion`, `/logos/facultad/:id`, `/images/silabo/:file` y `/plantilla.schema.json`.

**Listas paginadas:** 20 por página. Las de Usuarios, Coordinación y Biblioteca aceptan `sort` y `dir` con una lista de columnas permitidas.

---

## 6. Seguridad

- **Contraseñas:**
  - se guardan con bcrypt;
  - piden al menos 8 caracteres, sin otras reglas, en todos los entornos.
- **Sin verificación en dos pasos ni cambio de contraseña en Configuración:** el ingreso es con correo y contraseña (o la cuenta institucional). Quien olvida la contraseña la restablece con un enlace por correo.
- **Sesiones:**
  - en la base de datos, con cookie `HttpOnly`;
  - duración configurable (`SESSION_LIFETIME`; hoy 240 minutos, previsto bajar a 30);
  - sin «mantener sesión iniciada»;
  - se cierran todas al restablecer la contraseña;
  - cada vez que se abre una sesión se borran las sesiones y verificaciones vencidas de todos los usuarios (no hay trabajos programados en la cola, así que la limpieza va en el ingreso).
- **CSRF y orígenes:** solo se aceptan peticiones desde los dominios configurados (`STATEFUL_DOMAINS`).
- **Permisos:**
  - por rol y por carrera, verificados en el servidor en cada endpoint;
  - un rol activo por sesión;
  - la carrera de cada ruta de carrera la resuelve una sola función (`resolveCareerScope`): Coordinación trabaja siempre en la carrera de su rol y recibe 403 si pide otra; Administración trabaja en la carrera de `admin/careers/:career` y recibe 404 si no existe o está inactiva.
- **Límites de intentos** en el ingreso, la recuperación y las acciones sensibles, guardados en Redis.
- **Validación:** todas las entradas pasan por esquemas Zod en el servidor.
- **Firma digital:**
  - las aprobaciones se firman con el certificado **.p12** de cada persona;
  - el servidor verifica la firma (CMS), la vigencia y que el titular del certificado sea quien firma;
  - se puede exigir una lista de entidades certificadoras de confianza (`SIGNATURE_TRUSTED_CA_BUNDLE`).
- **Integridad:** cada versión enviada del sílabo guarda su **huella SHA-256**, y los documentos aprobados no se modifican.
- **Datos sensibles:** la clave de la IA se guarda cifrada (`APP_KEY`).
- **IA del docente:** solo Administración cambia qué puede leer y activa el asistente; se decide en el servidor: un campo sin permiso o bloqueado no se lee, y si el interruptor general no se puede leer de la base cuenta como apagado. El asistente del docente comprueba la regla de edición por registro en cada ruta y otra vez en el trabajo, no envía nombres, correos, variables del sistema ni datos de discapacidad, identifica al docente con un seudónimo, trata lo que devuelve el proveedor como texto no confiable y nunca guarda ni envía el sílabo.
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
| Envío de correo | Activación, restablecimiento y resumen diario de pendientes, con plantillas React Email |
| Exportación del sílabo | Instantánea → Word → PDF |
| Vista de documento de apoyo | Convierte el documento subido (Word, Excel, etc.) a PDF con Gotenberg para verlo en el navegador |
| Asistente de la plantilla | Respuesta de la IA, con propuestas que Administración aplica o descarta |
| Asistente del docente | Respuesta de la IA al docente: lee los campos permitidos y deja propuestas de texto |
| Prueba de plataforma | Comprueba que el worker y las colas funcionan |

---

## 9. Integraciones externas

| Servicio | Uso | Configuración |
|---|---|---|
| Gotenberg | Word → PDF | `GOTENBERG_URL` |
| SMTP | Notificaciones por correo | `MAIL_*` |
| DeepSeek (por el AI SDK) | Asistente de la plantilla y asistente del docente. Con `AI_DRIVER=baseline` funcionan sin IA externa | `AI_*` |
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
  - opciones de accesibilidad (alto contraste, tamaño del texto, sin animaciones y modo dislexia) guardadas solo en el navegador, sin pasar por el servidor;
  - tema claro al entrar, sin seguir el del sistema operativo; quien elige el oscuro lo conserva en su navegador;
  - tablas ordenables;
  - diseño adaptable a celular.

---

## 12. Pendientes conocidos

- **Tareas programadas:** el sistema anterior (Laravel) las ejecutaba con su programador. Todavía no están en el stack actual:
  - aviso de cierre próximo del plazo;
  - cierre automático de los procesos vencidos;
  - limpieza de enlaces de restablecimiento de contraseña.
- **Integración con los sistemas académicos de la UEB:** por definir con TICs.
