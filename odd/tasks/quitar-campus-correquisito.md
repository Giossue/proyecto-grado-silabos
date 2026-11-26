Objective: remove campus and corequisites from the database; teachers fill both in the syllabus.
Branch: main (no commits: the user reviews and commits). Delivery: working tree. Test runner: vitest (apps/api, apps/web, packages/shared).

## Specs

- S1 Corequisites leave the database. User: «lo de correquisito porque cuando me den acceso a la bd me dijeron que ellos no tienen eso, solo pre». The 2 stored `correquisito` rows in `requisitos_asignatura` are deleted and the column `tipo_requisito_asignatura` is dropped; every requirement is a prerequisite.
- S2 The curriculum (malla) only accepts prerequisites: a requirement from the same cycle is rejected with a message instead of becoming a corequisite. The Excel import drops the «Correquisitos (códigos)» column. The canvas drops the corequisite edge and its legend entry.
- S3 Campus leaves the database. User: «qué pasa cuando una misma facultad tiene dos campus?». The column `facultades.campus_facultad` and its CHECK constraint are dropped. Faculty create/edit forms, faculty and career tables, the campus filter, setup checklist and tour texts stop mentioning campus.
- S4 Teachers fill both in the syllabus. User: «mejor esos datos lo llenen los docentes». Decision (2026-11-25): the official template keeps the rows «CAMPUS UNIVERSITARIO» and «CORREQUISITOS», now as teacher-filled fields (same mechanism as `formacion_docente`); the template sources `identification.campus` and `identification.corequisites` are removed, and stored templates are migrated.
- S5 Decision (2026-11-25): the 14 existing syllabi keep what they show; only new syllabi ask the teacher.
- S6 Migrations are written in `apps/api/prisma/migrations`; applying them to any database needs the user's go-ahead.

## Tasks

- T1 S6 inline — done: schema.prisma, migration 20261126000000_quitar_campus_y_correquisitos (not applied), shared academic.ts (RED 2 failed → GREEN 148 passed), Prisma client regenerated, web types/academic.ts + api/career-academics.ts trimmed (shared by T2/T3).
- T2 S1 S2 delegated, done (api 299, web curriculum 24, tsc+eslint clean; RED→GREEN; same-cycle never offered, toast on drag) (parallel unit, disjoint surface) — corequisites in API curriculum/import/repositories and web canvas/dialogs, with tests.
- T3 S3 delegated, done (api 52/52, web 249/249, tsc+eslint clean in its files; RED→GREEN 5 api + catalog web) (parallel unit, disjoint surface) — campus in API governance/scheduled subjects/setup checklist and web catalog/tour/e2e, with tests.
- T4 S4 S5 delegated, done after resume (api 541 + full 2287, web syllabus 148 + full 1011, shared 149; tsc+eslint clean; sources renamed to identification.teacher_campus/teacher_corequisites; migration 20261126000100 written, not run) (parallel unit, disjoint surface) — syllabus template, identification card, context, historical documents, template data migration, with tests.
- T5 all inline — seam check done (tsc clean api/web/shared; vitest api 2287, web 1011, shared 149; eslint clean); parent also made TeacherSyllabusDetailPage reload the card after any card field (shownInCard) and documented in docs/sistema.md. Independent verifier running both migrations on a scratch copy of the local DB (Risk item 1).

## Log

- L1 (2026-11-25) User: «una cosa, me dijeron que dos campos se tienen que ir de la bd; campus y correquisito, el primero porque me pusieron un escenario complicado, qué pasa cuando una misma facultad tiene dos campus? cómo llevamos eso cuando una existe la misma facultad dos veces pero en teoría es la misma pero en diferentes lugares? y lo de correquisito porque cuando me den acceso a la bd me dijeron que ellos no tienen eso, solo pre, entonces me dijeron que mejor esos datos lo llenes los docentes»
- L2 (2026-11-25) Answers: campus row → «Que la llene el docente»; existing syllabi → «Dejarlos como están».
- L3 (2026-11-25) Local DB counts: 14 faculties (all «Campus Matriz Dr. Gabriel Galarza López»), 7 prerequisites, 2 corequisites, 14 syllabi. Waited for a concurrent Zed agent to finish (commit 0a7baa2) before starting.
- L4 Route: T2–T4 are independent units with disjoint edit surfaces, each several files; launched together as parallel writers. Parent owns shared files (Prisma schema, shared academic schema) and git.
- L5 (2026-11-26) Session restarted mid-T4; T4 resumed from its partial working-tree edits and finished. T4 renamed the template sources instead of keeping the old names (open choice reported to the user).
- L6 (2026-11-26) Independent verifier: both migrations PASS on a scratch copy of the local DB (now 18 syllabi, 16 faculties; L3 counts were stale): 2 corequisites deleted, 7 prerequisites kept, templates migrated, all 18 syllabi keep the campus/corequisites they showed, protected tables unchanged, migration 2 idempotent. Advisories: migration 1 was not rerunnable (fixed with a column-existence guard); a syllabus without a stored corequisites entry would get an empty value instead of «Ninguno» (no such data today).
- L7 (2026-11-26) User approved («Si») applying to the local DB. Backup respaldos/silabos_ueb-antes-quitar-campus-correquisito-20261126-0016.pgc (gitignored). prisma migrate deploy applied both migrations: 7 prerequisites remain, both columns gone, templates use teacher_campus, 18/18 syllabi have both new field values. Server DB not touched.
