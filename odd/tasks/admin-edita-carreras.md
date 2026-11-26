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
| A1 | S1-S3 | escritor delegado (respaldo de contexto) | en curso | — |
| A2 | S1-S3 | verificador independiente (riesgo 2: permisos) | pendiente | — |

## Log

- L1 (2026-11-25): pedido del usuario (S1). Mapa del explorador: todos los handlers sacan la carrera del rol activo (`careerSession` en `careerWrites.ts:108`, `deletions.ts:96`, `careerContext` en `structure.ts:92`, `curriculumCareer` en `structureImports.ts:85`, `fichaImports.ts:74`); la ficha de asignatura ya acepta admin (`mayManageSubjectProfile`). Bloqueos y regeneración dependen solo de `careerId`. Opción A recomendada y elegida (S2).
