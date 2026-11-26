Objective: a career can have several curricula (mallas); subjects belong to a malla; a "double curriculum" stops being a separate career.
Branch: main (no commits: the user reviews and commits). Delivery: working tree. Test runner: vitest (apps/api, apps/web, packages/shared). Start only after the concurrent DB cleanup (odd/tasks/limpieza-diseno-bd.md, D4) finishes.

## Specs

- S1 User: «hay que manejar de mejor manera la doble malla, ya no hay que tomarlo como una carrera aparte». New table `mallas` (Spanish names): `malla_id`, `carrera_id`, `nombre_malla`, `resolucion_malla` (optional), `numero_ciclos`, `estado_malla` (`vigente` | `en_transicion` | `cerrada`), optional start period; at most one `vigente` malla per career.
- S2 Subjects belong to a malla: `asignaturas.carrera_id` → `asignaturas.malla_id`; subject code unique per malla; `numero_ciclos` moves from `carreras` to `mallas`.
- S3 Curriculum screens (admin and coordination) address the malla by its own id (today `curriculumId === career.id`, `structure.ts:185`); the malla page lets the user pick the malla; the Excel curriculum import loads into the chosen malla.
- S4 Periods and syllabi: syllabus generation, scheduled subjects, subject profiles (proyecto de carrera) and readiness checks use the subjects of every non-closed malla of the career; the syllabus shows which malla it belongs to.
- S5 Data migration: every existing career gets one malla with its cycles and subjects. User (2026-11-26) on the duplicated career: «Ponle cualquiera, es una bd de prueba» → `SW-8` and `SW-9` merge into career `SW-9` with two mallas: SW-8's subjects become the `en_transicion` malla, SW-9's the `vigente` one; SW-8's convocatorias, role assignments, support documents and syllabi move to SW-9.
- S6 Out of scope. User: «Pero y eso que tiene que ver con el sistema de silabos???» → no homologation table between mallas.
- S7 Migrations are written in `apps/api/prisma/migrations`; applying them needs the user's go-ahead (local DB backup first).

## Tasks

- T1 S1 S2 S5 S7 — schema + data migration (rehearsed on a scratch copy of the local DB).
- T2 S2 S3 — API curriculum/structure/import by malla id, career CRUD without cycles, tests.
- T3 S3 — web malla selector, curriculum pages, Excel import target, tests.
- T4 S4 — convocation readiness, syllabus generation, scheduled subjects, subject profile, labels/documents, tests.
- T5 all — seam check (typecheck, lint, full suites), independent verifier for the data migration (Risk item 1).

## Log

- L1 (2026-11-26) User: «una cosa, hay que manejar de mejor manera la doble malla, ya no hay que tomarlo como una carrera aparte, sino que no sé como es la reforma, porfa investiga» → «investiga en internet». Research: CES RRA 2022 Art. 110 (ajuste curricular modifies the same career), Art. 81 (avoid two or more vigente mallas), Art. 82 (homologation), Disp. Gen. Quinta (transition); UEB RCU-009-2022-043 (Sociología «del Rediseño al Diseño», one career two mallas), RCU-009-2022-120 (modality change = different career).
- L2 (2026-11-26) Current model: no malla entity; `asignaturas.carrera_id`, unique (carrera_id, codigo_asignatura); `carreras.numero_ciclos`; curriculum id = career id; generation in `inProgressWork.ts` uses all active subjects of the career; `careerLabelSql` adds the code when two careers share a name (SW-8/SW-9 today).
- L3 (2026-11-26) User approved the proposal («sí», «ok entonces»); decisions in S5, S6. Waiting for the concurrent DB cleanup D4 before any schema change.
