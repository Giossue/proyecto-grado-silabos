# Editable field edited directly in the editor

Goal: a template field has only two states, «Editable» and «No editable». An editable field's content (the template text included) is edited by Coordinación directly inside the TipTap editor in «Proyecto de carrera», instead of static text plus a separate response box. Branch: main (direct commits allowed). Runner: vitest (apps/api, apps/web, packages/shared).

## Specs

- S1 — User (2026-11-26), with a screenshot of «Proyecto de carrera de Algoritmos y Lógica de Programación», field «10. Conducta y comportamiento ético» («Sin definir», the template text shown static, an empty input below): «QUe solo haya dos cosas, editable y no editable, ya no si quien lo llena, sino que ahora si es editable lo que está acá por ejemplo salga como tal dentro del tiptap, porque ahora como que sale aparte».
- S2 — Two states everywhere in the UI: «Editable» (stored `carrera`) and «No editable» (stored `institucional`). No «quién lo llena» / «lo completa Carrera» / «Institucional» wording on the admin, coordinator or teacher screens. For the teacher, a locked field reads «Bloqueado» (keep the lock).
- S3 — In «Proyecto de carrera», an editable field opens as one TipTap editor holding the whole content (the template text plus any spaces for the teacher). Coordinación can edit the text itself. The server accepts text edits for editable fields; «No editable» fields are still not editable by Coordinación. Tables that come with the template are protected (L6): Coordinación writes only inside their cells. A table cannot be deleted, rows or columns cannot be added or removed, and cells cannot be merged or split (colspan/rowspan). The editor blocks this immediately, and the server rejects it with «Las tablas de este campo las define Administración: escriba dentro de sus celdas, sin quitar ni agregar filas o columnas.», with responses on or off, like the block guard.
- S4 — Defaults chosen by the parent (assumptions, tell the user):
  - (a) What Coordinación edits is kept for that subject when Administración later changes the template text. Subjects without their own edits follow the template as today. Rule (L5): a value saved through the edited path is marked `doc.attrs.edited = true` by the server only. Only a marked copy is kept as is, and an admin block change still makes it follow the template. An unmarked stored row (slot-only, legacy rows included) follows the CURRENT template, with the coordinator's filled answers carried response by response and by position where the structure allows. Filling the space appended to a field with text and no spaces is a slot fill, not an edit.
  - (b) Response nodes that conditions (`show_if`) depend on cannot be deleted or have their options removed. They keep their ids.
  - (c) The teacher's flow stays the same: the coordinator's version becomes the teacher's fixed text, and the teacher fills only the remaining spaces.
  - (d) No DB migration: `valores_campo` (asignatura) already stores a full document.

## Tasks

- [x] T1 (S1–S4) — Route: delegated writer (context backstop). Risk: item 2 (server guard `careerResponse` relaxed) and item 1 (stored profile values) → independent verifier. RED observed (api 7 new failing, web 2), GREEN: api 2443, web 1113, shared 160. Verifier blockers in S4a fixed (L5): RED 4 new failing, GREEN api 2448, web 1113, shared 160. Protected tables (L6): RED api 4, web 3, GREEN api 2453, web 1117, shared 160. Commit: see L7

## Log

- L1 (2026-11-26) — user request: see S1.
- L2 — The other session's uncommitted work was committed first at the user's request (ccc3738; api 2434, web 1119, shared 160 green).
- L3 — Map, from an explorer:
  - `quien_llena` is already only carrera/institucional in the DB and the schema; docente/coordinacion are legacy and normalized to carrera.
  - The builder already shows Editable / No editable.
  - The static-text-plus-input layout comes from `responseTemplate`, which appends an empty slot (templateRuntime.ts:755), and from `FieldResponseEditor`, which renders template text statically (:406) and uses a full FreeTextEditor only when the template is blank (:426-438).
  - The server gate `careerResponse` + `matches(…,"career")` rejects text edits (templateRuntime.ts:894-906).
  - The web's `responseDocument` rebuilds from the template and drops text edits (fieldResponses.ts:36-51).
  - The subject value becomes the teacher's template via `profileTemplates` (subjectProfileFields.ts:42-51).
  - Risks:
    - lost `show_if` response ids;
    - `fieldCarried` dropping teacher answers;
    - `sameStructure` / limits assume the definition's structure;
    - `inProgressWork` change detection;
    - admin template updates versus edited copies.
- L4 (2026-11-26) — T1 done by the delegated writer, covering S1–S4. Decisions:
  - Server: `careerResponse` keeps the old path when the value still matches the template structure (the coordinator only filled slots). Otherwise it takes the edited path. Template responses are paired by kind, settings, `id` and `showIf`, and keep their condition and own options. New responses lose logic and answers, as before. Interior blank lines stay as teacher spaces, and extra trailing blank paragraphs are trimmed.
  - Guards when saving, with responses on or off: the field's `documentBlock`s (kind and props, in order) must be the template's, and only variables the template already uses are allowed. On read, only the block check applies: if Administración changes the blocks, the subject follows the template.
  - S4b: new `keepsUsedResponses` plus the existing `keepsUsedOptions` in `saveValues`. Changing the kind of a used response counts as removing it.
  - S4a: a stored subject value is kept when the admin changes the text, and `followTemplate` / `templateFor` no longer fall back. Subjects without a stored row follow the template. Six golden conformance cases now keep the stored copy (`templateRuntime.test.ts` `EDITED_COPIES`).
  - S4c: `fieldCarried` adds response-by-response carrying on top of the positional carry, so teacher answers survive text edits. Text the teacher typed in a blank paragraph is still carried only by position.
  - Web: in career mode, `FieldResponseEditor` is one `FreeTextEditor` (`value ?? template`, spaces on). The structured career UI is gone: the «De la plantilla» and «Opciones propias» badges, resetting to the template's options, the fixed type, and answering an admin response as Coordinación. Options are edited by selecting the response in the editor, and the server rejects a changed type of a used response.
  - S2: «Bloqueado» for the teacher; ribbon group «Edición»; «No editables» in tooltips; help texts and the admin error message reworded. `FIELD_RESPONSIBLES` and `responsibleLabel` were removed.
  - Not in the allowed surface: `apps/api/src/server/ai/templateKnowledge.json` still describes the layered «Editable (Carrera)» model, and `packages/shared/src/schemas/template.ts` still says «quién lo llena» in a validation message the UI cannot trigger.
  - Browser check not done: no dev server on :3000. No dev data written.
- L5 (2026-11-26) — The verifier passed S1, S2, S3, S4b and S4c and found two blockers in S4a. (1) Slot-only subjects kept the OLD template text. (2) Admin changes to responses (adding one, removing «texto», making it required) did not reach subjects with any stored row. Decision from the coordinator:
  - The edited path stores `attrs.edited = true` on the document. Normalization drops `doc.attrs`, so a client cannot set the marker, and the teacher's template, the coordinator's view and the PDF never carry it.
  - When reading (`careerResponse` with saving off, `templateFor`, `followTemplate`): an unchanged-structure row follows the template as before. A marked row keeps its edited version, but a block change still makes it follow the template. An unmarked row follows the current template through `followCurrent`: slots by position (children aligned by fit, preferring later matches), then responses paired by kind, settings, `id` and `showIf`, reusing the same pairing as `fieldCarried`.
  - `matches` now treats the space `responseTemplate` appends (a blank paragraph without attrs) as fitting a normalized paragraph. Filling it is a slot fill and no longer a 422 or an edit. Six golden conformance cases with «Escrito por carrera» in that space now keep the fill (`APPENDED_SLOT_FILLS` in `templateRuntime.test.ts`).
  - Known limit: an Excel import of the career project builds from the template structure, so it saves unmarked and replaces an edited copy.
  - Tests: the blocker 1 and 2 repros, a marked copy kept after an admin text change, the marker rejected from the client, no marker in the teacher's template, the coordinator's GET or the snapshot, and the appended space as a slot fill.
- L6 (2026-11-26) — User, verbatim: «según veo se complicó la cosa jaja, porque ahora hay libertar de incluso borrar las tablas .... y ahora». The user then chose «Texto libre, tablas protegidas (Recomendado)»: Coordinación edits the text in the editor, but the tables that come with the template cannot be deleted or change shape (rows and columns); they only write inside the cells. The editor blocks it immediately, without waiting for the save error. Implemented:
  - Web: a `ProtectedTables` ProseMirror `filterTransaction` in `FreeTextEditor`, only with `spaces` (career mode). It rejects any transaction that changes the shape signature: tables, rows, cell type, colspan/rowspan, and documentBlocks. Loading a value (`preventUpdate`) is exempt. The table tools (+/− Fila, +/− Columna, Combinar, Separar, Encabezado, Fondo, Quitar tabla) are hidden in that mode, and «Insertar tabla» and «Agregar fila» were already off (`allowTables={false}`).
  - Server: `assertCareerEdit` compares `tablesOf` (rows of [cell type, colspan, rowspan] per table, in order). It runs on save with responses on or off. On read it also applies to marked copies, so an admin change to the table shape makes the copy follow the template, like blocks.
  - Known effects: the fast path (slot fill only) still lets a list table gain rows, as before, but the career editor can no longer add rows. «Texto libre» in a field that has a template table does nothing, because it would delete the table.

- L7 (2026-11-26) — Browser check as coordinator, nothing saved:
  - «2. Descripción» and «10. Conducta» open as a single editable TipTap holding the whole text.
  - In «9. Relación», deleteTable / addRowAfter / deleteColumn leave tables 1→1 and rows 3→3; typing inside a cell works; no table tools are shown.
  - The independent re-check of the two S4a blockers was stopped by the user's next message; both repros are pinned by the writer's RED→GREEN tests (subjectProfileWrites/templateRuntime, 54 green on spot check).
  - Final: api 2453, web 1117, shared 160.
  - Known limits: an Excel import saves without the edited marker; «Texto libre» is a no-op in a field with a template table; the AI knowledge text still describes the old model.
