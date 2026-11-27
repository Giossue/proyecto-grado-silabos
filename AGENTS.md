<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Web platform

This project's Baseline target is Baseline 2024. Use the `modern-web-guidance` skill before building UI that relies on web platform features (dialogs, popovers, animations, forms, layout).

Submit buttons are never disabled to block validation: they stay enabled while fields are missing, and submitting marks each invalid field with its message and moves focus to the first one (react-hook-form + Zod). Only typed-phrase confirmations of destructive actions and in-flight requests disable a button.

# Guía de agentes — Sílabos UEB

Sistema web para elaborar, revisar, aprobar y firmar los sílabos de la Universidad Estatal de Bolívar. Admite varias facultades y carreras. Este repositorio reemplaza al anterior (Laravel + Vue): la lógica se migró aquí y el comportamiento original sigue siendo la referencia cuando algo no está documentado.

## Stack

- Monorepo pnpm: `apps/web` (Next.js 16, React, shadcn/ui, Tailwind 4, TipTap), `apps/api` (NestJS, Prisma 7 con `@prisma/adapter-pg`, puerto 8000, prefijo `api/v1`, Swagger en `/api/docs`) y `packages/shared` (esquemas Zod y lógica compartida).
- La lógica de negocio vive en `apps/api/src/server/**`; los módulos Nest (`apps/api/src/modules/**`) solo la conectan.
- PostgreSQL 18 es la única fuente de verdad. Redis para bloqueos y límites, MinIO para archivos, Keycloak para el ingreso (solo autentica: el usuario debe existir en la base), Gotenberg convierte el Word del sílabo en PDF.
- Despliegue en Dokploy (`compose.dokploy.yaml`).

## Lee antes de trabajar

- Documento técnico principal: `docs/sistema.md` (stack, arquitectura, modelo de datos, API, seguridad, documentos, colas, despliegue, calidad y pendientes conocidos en §12).
- Tareas en curso o recientes: `odd/tasks/` (ver `odd/README.md`).
- Abre solo lo que la tarea necesita.

## Precedencia

1. Seguridad, privacidad e invariantes de dominio.
2. Decisiones del usuario registradas (documento ODD de la tarea, `docs/sistema.md`).
3. Comportamiento del sistema original cuando no hay decisión registrada.
4. Convenciones generales.

Si dos fuentes se contradicen, detén esa parte y pregunta. No elijas en silencio.

## Flujo de trabajo: ODD

Se trabaja con ODD (*Organic Driven Development*). Formato y reglas en `odd/README.md`.

- Un cambio pequeño y entendido no deja documento.
- Uno grande (que no se podría retomar en otra sesión sin notas) lleva `odd/tasks/<feature>.md` antes de escribir código.
- Antes de cambiar comportamiento visible, revisa si contradice una decisión previa registrada en `odd/tasks/` o `docs/sistema.md`; si es así, avisa al usuario antes de seguir.

## Verificación

Desde la carpeta de cada paquete (nunca desde subcarpetas: crea cachés que rompen pruebas):

```bash
cd apps/api && npx vitest run && npx tsc --noEmit -p .
cd apps/web && npx vitest run && npx tsc --noEmit -p . && npx eslint <rutas>
cd packages/shared && npx vitest run
```

- Proporcional al cambio: en ajustes pequeños, solo la prueba puntual.
- Pruebas de punta a punta (Playwright): `E2E_PORT=3800 pnpm test:e2e` con `E2E_PASSWORD`, `E2E_P12_PASSWORD` y `E2E_SCRATCH_DIR`; antes detén los servidores de desarrollo y arranca Gotenberg (`podman start gotenberg-local`).
- Agregar o quitar una ruta de la API exige tocar `apps/api/src/server/http/apiRoutes.json`, el controlador Nest, `apiContract.test.ts` (conteo) y las pruebas de rutas.
- Una prueba de tiempos (`src/server/redis/lock.test.ts`) puede fallar en la corrida completa y pasar sola.

## Restricciones de producto vigentes

- Roles: Administrador, Coordinador (por carrera), Docente y Bibliotecario (global). Administración controla todo, sin las restricciones de periodo de Coordinación.
- Un sílabo pertenece a un **paralelo** en una convocatoria de carrera (uno por paralelo y periodo). El paralelo tiene código y jornada y un solo docente activo.
- Estados del sílabo: Sin iniciar, Borrador, En revisión, Corrección solicitada y Aprobado. Sigue en «Sin iniciar» hasta que el docente escribe algo.
- Revisión en orden Docente → Biblioteca → Coordinación, con firma electrónica en el navegador (`.p12`). Una revisión enviada o aprobada congela su contenido y su definición de plantilla (no se migra: tiene huella).
- Plantilla: una sola, sin versiones, solo datos. Su JSON (exportar e importar) está en español y en forma corta; la importación acepta también el formato anterior en inglés. La plantilla base es `apps/api/src/server/configuration/officialTemplate.json`. Los estilos viven solo en `documento`.
- La plantilla decide una sola vez quién llena cada campo («¿Quién lo llena?»): **Nadie (texto fijo)** (`institucional`), **Coordinación** (`carrera`) o **Solo el docente** (`carrera` y la clave en `teacher_fields`, `campos_docente` en el JSON). Al docente, lo que no puede tocar le sale «Bloqueado». Un campo «Solo el docente» no aparece en el proyecto de carrera, y lo que el docente ya tiene en sus sílabos no se borra.
- Proyecto de carrera: Coordinación edita en el editor el texto completo de cada campo que llena; las tablas de la plantilla están protegidas (solo se escribe en sus celdas). Lo editado se guarda como copia (`attrs.edited`) y se conserva si cambia la plantilla; lo no editado sigue la plantilla.
- El proyecto de carrera se edita antes de abrir el periodo y con el periodo de la carrera en pausa; abierto o finalizado queda de solo lectura (con el periodo abierto, Coordinación lo pausa, edita y lo reanuda). «Sin definir» impide abrir el periodo de la carrera.
- El docente edita su sílabo solo con el periodo y la convocatoria de su carrera abiertos.
- Toda migración que reescriba la plantilla debe guardar y restaurar `plantilla_silabo.plantilla_modificada_en`; si no, al reanudar se rehacen los sílabos y se avisa a los docentes.
- Las confirmaciones son directas: no se piden frases escritas.

## Reglas de implementación

- No escribas comentarios en el código. Solo se admiten anotaciones que lee una herramienta (tipos, `eslint-disable`, `@ts-expect-error`).
- Interfaz en español, con componentes shadcn. El título de la pestaña es siempre «Sílabos UEB».
- Alcance por registro en el servidor: ocultar un botón no concede ni quita permisos.
- Esquema de base en español (`<tabla>_<cols>_fk/_unica/_idx/_check`, `creado_en` y `actualizado_en` por trigger). No edites migraciones aplicadas: agrega una nueva SQL en `apps/api/prisma/migrations/`.
- No registres secretos ni datos personales en logs. Las credenciales van solo en `.env.local`; nunca las muestres ni las subas.

## Control de versiones

- Cambios pequeños y coherentes, con commit `tipo(alcance): asunto` en español.
- Se trabaja en `main`; commit y push están permitidos al terminar un cambio verificado.
- Puede haber otra sesión trabajando en el mismo árbol: revisa `git status` y sube solo tus archivos.
