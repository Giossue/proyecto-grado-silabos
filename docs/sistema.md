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
- **Proyecto de carrera, campo Editable en el editor:** un campo de la plantilla es «Editable» (se guarda `carrera`) o «No editable» (`institucional`). En el proyecto de carrera cada campo Editable se abre como un solo editor con todo su contenido (lo guardado de la materia o, si no hay, el de la plantilla), y Coordinación cambia ahí el texto y pone los espacios del docente. Las tablas de la plantilla quedan protegidas: el editor y el servidor no dejan quitarlas, agregar o quitar filas o columnas ni combinar celdas; solo se escribe dentro de sus celdas. El servidor (`careerResponse`) acepta el texto editado pero no deja agregar ni quitar bloques ni datos del sistema nuevos, ni quitar una respuesta o una opción que use una condición (`keepsUsedResponses`, `keepsUsedOptions`); las respuestas de la plantilla se reconocen por tipo, ajustes, `id` y `showIf`. Si Coordinación cambió el texto, el servidor guarda el valor marcado como copia editada (`attrs.edited`, que solo pone el servidor y no llega al docente ni al PDF) y esa versión se conserva aunque Administración cambie después el texto de la plantilla; un valor sin marca (solo espacios llenados, incluidos los anteriores) sigue la plantilla actual con lo llenado pasado por respuesta y por posición. La versión de la materia llega al docente como texto fijo con sus espacios abiertos, y las respuestas del docente pasan a la versión nueva por respuesta (`fieldCarried`) aunque cambie el texto alrededor. Una línea vacía dentro del texto es un espacio para el docente, igual que en la plantilla; las líneas vacías sobrantes al final se quitan.
- **Proyecto de carrera, campos definidos:** cada campo de Carrera de cada materia que genera sílabo debe quedar definido por Coordinación. Un campo está definido cuando tiene texto propio o un tipo de respuesta («Texto libre», «Elegir una» o «Elegir varias»), puesto por Coordinación o ya por Administración en la plantilla; dejar líneas o espacios en blanco no cuenta. Una elección sin opciones sigue pendiente. La regla es `careerFieldUndecided` (paquete compartido): la pantalla marca esos campos como «Sin definir», el avance de la materia los descuenta y, mientras quede alguno, no se puede abrir el periodo académico de la carrera (solo al abrirlo: reanudar uno pausado no lo exige). Si un sílabo de un periodo ya abierto tiene un campo de Carrera vacío, lo sigue escribiendo el docente y es obligatorio para enviar.
- **Proyecto de carrera, antes y con el periodo abierto:** Coordinación guarda el proyecto de carrera e importa su Excel (descargar, revisar y aplicar) según el proceso de la universidad más reciente por su período (`careerProfileEditable`): sin ningún proceso, se puede (primera preparación); con el proceso «pausado» o «cerrado», no; con el proceso «abierto», se puede si la convocatoria de la carrera en ese proceso no existe o está en «preparacion» o «abierto», y no si está «pausado» o «cerrado». Bloqueado, el servidor responde 422 `process` «El proyecto de carrera no se puede editar con el periodo académico en pausa o finalizado.» y la pantalla queda de solo lectura con ese motivo (`lock_reason` en la ficha, `career.profile_lock_reason` en materias programadas, que deshabilita «Importar desde Excel»). Administración no tiene esta restricción. Los campos «Sin definir» siguen impidiendo abrir el periodo académico de la carrera. La malla y los demás datos académicos siguen con su regla («Periodo académico activo»).
- **Proyecto de carrera, acciones masivas:** en la lista del proyecto de carrera (Coordinación y Administración) se marcan materias, o «Seleccionar todo» en un ciclo, y con «Acciones masivas» se definen a la vez sus campos «Sin definir»: todos los pendientes o los que se elijan. «Usar el texto de la plantilla» guarda el texto de la plantilla tal cual con la marca `attrs.accepted` (la pone solo el servidor; `careerFieldUndecided` y el avance lo cuentan como definido), sin la marca de copia editada, así que sigue los cambios que Administración haga en la plantilla; guardar después la materia sin decidir nada en ese campo no quita la marca. «Que lo escriba el docente» deja un solo espacio «Texto libre», igual que «Configurar campo». La ruta es `POST coordination/subject-profiles/bulk` (y `admin/careers/:career/subject-profiles/bulk`) con `subjects`, `fields` (vacío: todos los pendientes) y `action` (`plantilla` o `docente`); pasa por la misma validación que guardar la materia (`careerResponse`, respuestas y opciones que usan condiciones), en una sola transacción, con la regla de edición (`careerProfileEditable`, Administración exenta) y la confirmación `confirm_purge` cuando hay sílabos en curso. Solo toca campos pendientes: los ya definidos se cuentan como omitidos y nunca se sobrescriben; los que no admiten la acción (una plantilla sin texto, «Texto libre» en un campo con tablas o bloques de la plantilla, o una elección sin opciones) se cuentan aparte. Responde `applied`, `skipped` y `not_applicable`.
- **Docente sin activar su cuenta:** Coordinación y Administración le asignan paralelos aunque todavía no haya activado la cuenta; cuenta como docente de la carrera y no impide abrir el periodo académico. Para entrar sigue necesitando activar la cuenta desde su correo. Un docente «Inactivo» o con la cuenta deshabilitada no recibe paralelos.
- **Carreras con varias mallas:** una carrera puede tener varias mallas (tabla `mallas`: código, número de ciclos y estado `vigente` o `cerrada`; puede haber varias `vigente` a la vez). El código de la malla es único dentro de la carrera, con las mismas reglas que los códigos de carrera y de asignatura; donde se muestra una malla se lee «Malla <código>» («Malla SW-8»). Al crear una carrera, su primera malla toma el código de la carrera. Cada asignatura pertenece a una malla (`asignaturas.malla_id`; `carrera_id` se conserva como copia amarrada con una clave foránea compuesta) y su código es único dentro de la malla. La pantalla de malla elige la malla y la gestiona: al crearla se piden el código y los ciclos, y siempre nace `vigente`; al editarla, el botón «Editar malla» cambia el código, los ciclos y el estado. Hacer vigente una malla (nueva o una cerrada que se reabre) no cambia las demás, y cerrarla es siempre manual: no se puede cerrar una malla con sílabos en un periodo abierto. Los periodos generan sílabos con las asignaturas de todas las mallas vigentes; cada sílabo guarda su malla (`curriculum` en el contexto académico, con el nombre «Malla <código>»; fuente de plantilla `identification.curriculum`). Una «doble malla» ya no es otra carrera: `apps/api/scripts/fusionar-carreras.sql` fusiona dos carreras (`psql -v keep=… -v absorb=…`); las mallas absorbidas conservan su estado.
- **Arrastre entre sílabos:** cada valor guarda en `valores_campo.huella_definicion_campo` el SHA-256 de la definición del campo con la que se escribió. Al generar o iniciar un sílabo, si un campo del docente está vacío, toma lo último que escribió cada docente vigente en ese mismo campo (cualquier materia o período, por `silabos.guardado_en`), siempre que la definición no haya cambiado. Si hay varios docentes, sus textos van uno debajo del otro, sin repetir.
- **Estado al abrir un sílabo:** al abrirlo por primera vez, la API (`POST /teacher/syllabi/{id}/start`) lo prepara: copia lo del período anterior, arrastra los campos del docente y fija `silabos.iniciado_en`, pero lo deja en `sin_iniciar`. Pasa a `borrador` con el primer guardado de un campo que cambia lo guardado (o con «Copiar desde otro paralelo»); guardar el mismo valor no lo cambia. Un sílabo `sin_iniciar` con `iniciado_en` ya se puede editar, validar y enviar, y para el resto del sistema (plantilla nueva, cambio de docente al reabrir, copiar desde otro paralelo, protección al eliminar) cuenta como empezado.
- **Migración `20261125220000_formacion_como_campo`:** agrega el campo y la huella, pasa la formación que estaba en `usuarios` a los sílabos vivos (los enviados o aprobados toman la de su última versión enviada), llena las huellas y elimina `usuarios.formacion_experiencia_usuario`. No toca versiones, aprobaciones ni instantáneas.
- **Migraciones `20261126010000_limpiar_restos_y_relaciones`, `20261126010100_nombres_uniformes` y `20261126010200_auditoria_y_bloqueos`:** la primera borra lo que quedaba del sistema anterior (tabla `sesiones`, `usuarios.codigo_recordarme`, esquema `drizzle`), las sesiones y verificaciones vencidas, las claves foráneas repetidas de `campos_plantilla` y `definiciones_campo` (quedan las compuestas, con `RESTRICT`, que era lo que ya se aplicaba) y tres índices redundantes, y agrega la clave compuesta de las firmas y los índices de `notificaciones.periodo_academico_id` y `sesiones_usuario.active_role_assignment_id`; la segunda solo cambia nombres de restricciones, índices y de la función `impedir_cambio_periodo_con_convocatorias_carrera`; la tercera agrega los bloqueos y las columnas de auditoría. Las filas que ya existían quedaron con `creado_en` y `actualizado_en` iguales a la fecha de la migración, no a su fecha real.
- **Contraseña:** el hash vive solo en `cuentas_usuario.password` (la cuenta `credential` de Better Auth). Crear una cuenta, activarla, restablecer la contraseña y el seed escriben ahí; `usuarios` no guarda contraseña.
- **Mensajes del asistente de IA:** `mensajes_ia_plantilla` guarda el estado en columnas: `rol` (`usuario`, `asistente`), `estado` (`pendiente`, `en_ejecucion`, `completado`, `fallido`), `codigo_error`, `completado_en` y `clave_idempotencia` (único por plantilla y usuario en las preguntas, `mensajes_ia_plantilla_idempotencia_unica`). `contenido_mensaje` guarda solo el contenido (entrada, respuesta, traza, uso). El repositorio arma el mensaje completo al leer y lo separa al escribir, así que las respuestas de la API no cambian.
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

**147 endpoints** en total.

| Área | Endpoints | Qué cubre |
|---|---|---|
| `authentication` | 7 | Ingreso y salida, activación de cuenta, recuperar y restablecer contraseña por correo y perfil |
| `session`, `active-role` | 2 | Sesión actual y cambio de rol o carrera activa |
| `admin` | 43 | Facultades, carreras y períodos (con importación desde Excel), usuarios y roles (con importación), procesos del período (abrir, pausar, reanudar, prórroga, impacto, finalizar), ajustes del sistema (correo, IA, catálogo, firmas), plantilla (estructura, campos, bloques, formato, logo, vista previa del docente, JSON) y asistente de IA |
| `admin/careers/:career` | 26 | Las mismas rutas de malla, materias programadas, paralelos, asignación docente, docentes y proyecto de carrera de `coordination`, para la carrera indicada. Solo Administración; no incluyen revisar ni aprobar sílabos |
| `coordination` | 36 | Malla (asignaturas, requisitos, disposición, configuración, importación), materias programadas, paralelos y asignación docente, docentes (con importación), periodo académico de la carrera, proyecto de carrera (ficha en Excel y acciones masivas), revisiones (comparar versiones, pedir corrección, aprobar con firma), historial y documentos de apoyo |
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
  - opciones de accesibilidad (alto contraste, tamaño del texto, sin animaciones y modo dislexia) guardadas solo en el navegador, sin pasar por el servidor;
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
