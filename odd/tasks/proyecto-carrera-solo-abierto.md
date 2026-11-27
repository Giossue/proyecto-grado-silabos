# When teachers and coordination can edit syllabi and the career project

Goal: teachers edit syllabi only while the academic period (convocatoria) is open; coordination edits «Proyecto de carrera» before opening it or while it is paused (L6). Branch: main. Runner: vitest.

## Specs

- S1 — User (2026-11-26): «Una cosa, si la convocatoria no está abierta que docentes ni coordinadores puedan editar: - SIlabos - Proyecto de carrera / Solo eso».
- S2 — Syllabi already comply: a teacher edits only when `isRunning`, i.e. the career convocation and the university process are both «abierto» (apps/api/src/server/syllabus/policy.ts:68). Coordinators don't edit syllabus content. No change; just pin it with a test if none exists.
- S3 — «Proyecto de carrera» follows L6, which replaces the L4 rule: for non-admin sessions, saving the career project and every Excel ficha import step are allowed before the career period opens and while it is paused, and blocked while it is open or finalized. Let P be the most recent university process (convocatorias_universidad, by its period):
  - No P at all → allowed (first preparation).
  - P or the career's convocation in P 'cerrado' → blocked: «El proyecto de carrera no se puede editar con el periodo académico finalizado.»
  - The career's convocation 'abierto' (P 'abierto' or 'pausado') → blocked: «Pause el periodo académico de su carrera para editar el proyecto de carrera.» The lock banner links to «Revisión».
  - Otherwise (no convocation, 'preparacion' or 'pausado') → allowed.
  - Helper `careerProfileBlock` returns the reason or null. The admin exemption and the `lock_reason` / `profile_lock_reason` exposure stay as built in T1.
  - The malla and the other academic data keep their current rule («Solo eso»).
  - The rule «Sin definir blocks opening a career's period» stays as is.
  - Administración keeps full control (earlier decision: the admin edits any career without restrictions).
  - When it's edited with syllabi in progress, the existing confirm_purge / keepContent flow adapts them.

## Tasks

- [x] T1 (S2, S3) — reopened by L6, inline — commit: pending (see L7)

## Log

- L1 (2026-11-26) — the request is S1. Told the user that today it is the opposite (prepared before opening, locked while active). The user chose «Solo con el periodo abierto».
- L2 (2026-11-26) — T1 done. API: `careerProfileOpen(db, careerId)` and `careerProfileLockReason(session, careerId, careerOpen)` in apps/api/src/server/configuration/subjectProfile.ts (open = career convocation «abierto» with university process «abierto», via `isRunning`). Saving the career project and the three Excel ficha steps (template, preview, apply, also re-checked inside the apply transaction) answer 422 `process` «El proyecto de carrera solo se edita con el periodo académico abierto.» for any non-admin role. Administración is exempt (`ROLE_ADMINISTRATOR`), per the earlier decision that the admin edits any career without restrictions. The GET/PUT ficha returns `lock_reason`; scheduled-subjects returns `career.profile_lock_reason` (derived from the existing `careerLock`: open when locked and not institutionally paused). `careerDataLocked` stays for the malla and academic data, unchanged. Web: the subject page is read-only with the reason in a ProcessLockAlert banner; «Importar desde Excel» is disabled with the reason as tooltip. S2: draftField.test.ts already pinned «paused»; added a test for the closed («cerrado») process and convocation.
- L3 (2026-11-26) — Open point for the parent: docs/sistema.md and the help texts say a career's period cannot be opened while a career-project field is «Sin definir». With S3, coordination can only fill those fields while the period is open, so a coordinator of a career with undecided fields cannot fill them or open the period; only Administración can. Not changed; needs a product decision.
- L4 (2026-11-26) — User decision, verbatim as relayed: «You raised the deadlock (L3). After discussing it, the user chose «Antes y con el periodo abierto (Recomendado)»: the career project is editable before the period opens and while it is open, and blocked when paused or finalized. «Sin definir» still prevents opening.» S3 rewritten; T1 reopened and reworked.
- L5 (2026-11-26) — T1 reworked to S3/L4. `careerProfileEditable(db, careerId)` (apps/api/src/server/configuration/subjectProfile.ts) reads the most recent university process by `periodos_academicos.fecha_inicio_periodo` with a left join to the career's convocation in it; message «El proyecto de carrera no se puede editar con el periodo académico en pausa o finalizado.». scheduled-subjects now gets `careerProfileEditable` as a dependency (wired in modules/academic/academic-deps.ts) instead of deriving it from `careerLock`. Admin exemption, `lock_reason` / `profile_lock_reason` and the web read-only UI unchanged. Help texts and docs/sistema.md updated. Checks: api vitest 2460/2460, api tsc exit 0, web vitest 1120/1120, web tsc exit 0. On the first full run, two timing tests outside this change failed once (api LockTimeoutError wait, web confirmation dialog) and passed on rerun.
- L6 (2026-11-27) — User request, verbatim: «Por qué puedo editar el proyecto de carrera aunque esté corriendo el periodo? me refiero para el coordinador... porqué pasa eso?», and after the explanation and the question whether coordination should edit it with the period open: «el que "NO", y no, no es que lo corrige administración, sería más bien que pause el coordinador y ahi modifique, y ya, pero claro, admin puede hacerlo, pero casi ellos no lo harán». S3 rewritten and T1 reopened. Finalized stays blocked (not part of the request).
- L7 (2026-11-27) — L6 done inline. RED first (api 5, web 2, then the pause notice 1). Change alone on an isolated copy of 854e4d6: api 2766/2766 (5 Redis suites need .env; they pass in the repo), web 1377/1377, shared 167/167. Independent verifier (item 2, guard): no blockers; its pause-notice advisory (DeadlineBanner) fixed afterwards. E2E not run; its coordination flow already edits the career project between pause and resume. Another session works in the same tree (odd/tasks/accion-masiva-y-carreras-sin-malla.md, whose S1.6 still names the old read-only states).
