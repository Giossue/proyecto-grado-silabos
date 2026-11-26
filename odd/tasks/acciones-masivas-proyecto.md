# Bulk actions in «Proyecto de carrera»

Goal: Coordinación defines pending («Sin definir») career-project fields for several subjects at once. Branch: main. Runner: vitest.

## Specs

- S1 — User (2026-11-26): «creo que debemos crear algo como acciones masivas». The agreed proposal: select several subjects and pending fields, and apply at once:
  - «Usar el texto de la plantilla»: the field is defined with the template text as is;
  - «Que lo escriba el docente»: it becomes a «Texto libre» space for the teacher.
- S2 — It lives on the coordination «Proyecto de carrera» list page (apps/web/src/app/(shell)/coordinacion/proyecto-carrera/). It respects the editing rule from proyecto-carrera-solo-abierto.md (editable before opening and while open, blocked when paused or finalized; Administración exempt). It goes through the same server validation as a normal save (careerResponse, responses used by show_if, the edited marker) and the same confirm_purge flow when syllabi are in progress. After applying, the «Sin definir» counts update.
- S3 — Only pending fields are touched; fields already defined are never overwritten.

## Tasks

- [x] T1 (S1–S3) — delegated writer — commit: see L3. RED observed (api: module missing, then 13 failing; web 5; shared 2; help 1). GREEN: api 2479, web 1126, shared 162; api and web tsc exit 0

## Log

- L1 (2026-11-26) — the user asked for bulk actions to resolve «Sin definir» pending fields, after choosing the rule «Antes y con el periodo abierto» (commit 2d690a4).
- L2 (2026-11-26) — T1 done by the delegated writer, covering S1–S3. Decisions:
  - «plantilla» counts as defined through a new server-only marker `doc.attrs.accepted = true` (`TEMPLATE_ACCEPTED`, `templateAccepted` in packages/shared responseKinds.ts). Evidence: `careerFieldUndecided` is purely content-based (no response and the same written text as the template), and `saveValues` deletes a value equal to the template, so storing the template text alone stays «Sin definir». The stored document is the template (`responseTemplate`) without the edited marker, so it follows later admin template changes. `careerFieldUndecided` and `fieldPending` treat an accepted value as decided. The GET ficha adds the marker to that field's value so the subject page shows it as defined. A later save of the subject that leaves that field undecided keeps the accepted row; the browser cannot set the marker (normalization drops `doc.attrs`).
  - «docente» stores `{ doc: [paragraph: [emptyResponse("texto")]] }`, the same node «Configurar campo» → Texto libre writes, through `careerResponse` (edited marker when the template had text, as with the editor).
  - Only pending fields (`fieldPending`) are touched: defined ones count as `skipped`. Fields that cannot take the action count as `not_applicable` instead of failing the batch: «plantilla» on a template without text or on a choice without options, «docente» where the template has tables or blocks or a response used by a condition.
  - API: `POST coordination/subject-profiles/bulk` and `POST admin/careers/{career}/subject-profiles/bulk` (`bulkSubjectProfiles` in apps/api/src/server/configuration/subjectProfileBulk.ts, `subjectProfileBulkSchema` in shared imports.ts). Body `subjects`, `fields` (empty = all pending), `action`, `confirm_purge`. Career scope via `resolveCareerScope`; each subject is locked and checked with the same `lockCareerSubject` (403 for another career, 404 unknown, 422 `process` when paused or finalized, admin exempt) and `careerFieldDocument` validation extracted from `saveValues`; one transaction inside `keepContent`. Answers `{ message: "Acción masiva aplicada.", applied, skipped, not_applicable }`.
  - Web: checkboxes per subject card and «Seleccionar todo» per cycle; a toolbar «N materias seleccionadas» with «Acciones masivas» (disabled with the lock reason as tooltip) and «Quitar selección»; a dialog with the action, «Todos los campos sin definir» or «Elegir campos» (field names from the first selected subject's ficha), the counts, then a toast summary and a refetch. The purge 422 auto-resends through `withPurgeConfirmation`, like the single save.
  - Docs: docs/sistema.md bullet and endpoint counts (147; admin/careers 26; coordination 36); help texts for both list pages.
  - Browser check not done.

- L3 (2026-11-26) — Independent verifier: S1, S2 and S3 PASS; no blockers. The single-save differential against 2d690a4 is identical. Advisories:
  - an accepted field can only go back to «Sin definir» by sending null;
  - a legacy unmarked custom row can be replaced by «docente»;
  - the Excel import overwrites accepted rows (as at the baseline);
  - the order of errors differs.
