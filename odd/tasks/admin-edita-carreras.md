# El administrador edita malla, paralelos y asignaciones de cualquier carrera

Objetivo: el administrador puede hacer en cualquier carrera lo que hoy solo hace su coordinador (malla, materias programadas, paralelos, asignación docente, importaciones y proyecto de carrera), sin poder revisar ni aprobar sílabos.
Rama: `main`. Pruebas: Vitest (api, web), typecheck, lint; E2E al cerrar.

## Specs

- S1. «ojo con lo de desactivar, el admin si cambia, recuerda que es el adminsitrador como taly permite que el administrador pueda modificar las mallas, las asignaciones, o sea demosle también la posibilidad»
- S2. Decisión: «Opción por carrera (Recomendado)»: en «Facultades y carreras» cada carrera tiene «Malla y paralelos» y «Proyecto de carrera»; se abren las mismas pantallas del coordinador para esa carrera; el admin no revisa ni aprueba sílabos; los avisos a docentes dicen «Administración cambió…».
- S3. Seguridad: un coordinador nunca puede tocar otra carrera aunque envíe otro identificador de carrera (pruebas negativas).

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| A1 | S1-S3 | escritor delegado (respaldo de contexto) | hecho (S1, S3 completos; S2 salvo el texto «Administración cambió…», ver L2) | — |
| A2 | S1-S3 | verificador independiente (riesgo 2: permisos) | hecho: 1 bloqueo corregido (ver L3) | — |

## Log

- L1 (2026-11-25): pedido del usuario (S1). Mapa del explorador: todos los handlers sacan la carrera del rol activo (`careerSession` en `careerWrites.ts:108`, `deletions.ts:96`, `careerContext` en `structure.ts:92`, `curriculumCareer` en `structureImports.ts:85`, `fichaImports.ts:74`); la ficha de asignatura ya acepta admin (`mayManageSubjectProfile`). Bloqueos y regeneración dependen solo de `careerId`. Opción A recomendada y elegida (S2).
- L2 (2026-11-25): A1 implementado. Servidor: `resolveCareerScope` (`apps/api/src/server/academic/careerScope.ts`) reemplaza los chequeos duplicados de `careerWrites`, `curriculumWrites`, `deletions`, `structure`/`scheduledSubjects`, `structureImports`, `fichaImports`, `careerTeachers` e `identity/imports`: administrador → carrera pedida (404 de modelo si no existe, está inactiva o no es UUID; 403 si no pide carrera); coordinador → siempre su carrera, 403 si pide otra. Rutas espejo `admin/careers/{career}/academic/*` (controlador `AdminCareerAcademicController`) y `admin/careers/{career}/ficha-imports/*` (en `FichaController`): 25 rutas, 31 métodos en `apiRoutes.json` (contrato 190 → 221). Revisión y aprobación sin tocar. Web: acciones «Malla y paralelos» y «Proyecto de carrera» por carrera activa en «Facultades y carreras»; pantallas `/admin/estructura-academica/carreras/:career/{malla,materias-asignaciones,docentes,proyecto-carrera,proyecto-carrera/:subject}` que reutilizan las de Coordinación con `careerId`, nombre de la carrera en el título, vuelta a «Facultades y carreras» y pestañas entre vistas; sin «Documentos de apoyo» para Administración. Ayuda por pantalla y `docs/sistema.md` actualizados. Pendiente S2: el aviso «Coordinación cambió el código o la jornada del paralelo» está fijo en `apps/api/src/server/syllabus/inProgressWork.ts:309` (archivo excluido); hace falta un parámetro `reason` en `restartSentForParallel` y pasarlo desde `careerWriteStore.ts:209`. Evidencia: `pnpm typecheck` y `pnpm lint` sin errores; api 149 archivos / 2276 pruebas, web 173 / 1003, shared 16 / 147, todas pasan. RED observado antes de implementar en `careerWrites.test.ts` (5 pruebas nuevas fallaban).
- L3 (2026-11-25, A2): verificador independiente: sin acceso entre carreras ni IDOR (admin en la carrera B con registros de A → 404/422 sin escribir; coordinador de A en B → 403). Bloqueo B1: un coordinador podía usar las rutas `admin/careers/{su carrera}/*` y su cambio de paralelo avisaba «Administración cambió…». Corregido: `resolveCareerScope` rechaza al coordinador en cualquier ruta con carrera en la URL (403); pruebas ajustadas (`careerScope.test.ts`, `careerWrites.test.ts`, `academic.equivalence.test.ts`). API: 2278 pruebas pasan. El aviso «Administración cambió…» quedó en f635625.
