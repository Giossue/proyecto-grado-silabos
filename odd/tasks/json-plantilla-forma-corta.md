# JSON de la plantilla en forma corta

Goal: the template JSON (Admin → Plantilla → Opciones avanzadas → Editar JSON, and its import/export) writes the special tables (`blocks`) in a short, readable form that the system translates. Internal storage and saved syllabi are unchanged. Branch: main (direct commits allowed by the user). Runner: vitest (`pnpm --filter @silabos/api test`, `pnpm --filter @silabos/web test`, `pnpm --filter @silabos/shared test`).

## Specs

- S1 — Export writes each `blocks.<kind>` in short form. The example agreed with the user (2026-11-26):
  ```json
  "unidades": {
    "filas": "1-8",
    "columnas": {
      "nombre": "texto",
      "resultado": "texto",
      "semanas": {
        "filas": "0-52",
        "columnas": { "contenidos": "texto", "acd_h": "horas", "ape_h": "horas", "aa_h": "horas", "evaluacion": "texto" }
      }
    }
  },
  "reglas": ["semanas_maximas", "horas_unidades_no_coinciden"]
  ```
  Promise to the user: «las reglas más usadas irían por su nombre y el sistema conoce el detalle técnico». «El JSON queda corto y legible, conserva la validación de horas y el buscador, y no hay que tocar los sílabos ya guardados.»
- S2 — The short form must be able to express everything the 4 current kinds use without losing information. The kinds are identificacion, unidades, evaluacion and bibliografia. Things to cover:
  - column titles;
  - text limits;
  - numbers (hours: maximum 999.99, multipleOf 0.01);
  - options (sí/no);
  - `keep_if`;
  - min and max rows;
  - nested lists;
  - `catalog`;
  - `layout`;
  - `props`;
  - the `errorMessage` values.

  Defaults must be applied so the common case is short (for example, a bare `"texto"` means string with maxLength 1000, titled from the key or given title). Values that differ from the default stay explicit. Admin-designed kinds (TemplateTableDesigner / repeatableTable) must also be exportable: in short form when possible, otherwise the full form is still allowed.
- S3 — Known rules go by name only. The system has a catalog of the current rules: semanas_maximas, unidades_sin_nombre, unidades_sin_semanas, semanas_unidades_incompletas, horas_unidades_no_coinciden and libros_sin_titulo. Each entry holds the full definition used today (message, hint, checks, on). A rule that differs from its catalog entry, or is not in the catalog, is exported as a full object.
- S4 — Import accepts BOTH the new short form and the current full form, including JSON files exported before this change. Round trip:
  - export → import gives a definition identical to the stored one, for the official template and for a template with an admin-designed table;
  - importing an old full-form export gives the same definition as before.
- S5 — Nothing else changes: the internal definition stored in `plantilla_silabo.definicion_plantilla`, `valores_campo`, snapshots, the PDF/DOCX, validation and the Koha catalog search keep working exactly as today. Errors in an invalid short form are reported in Spanish with the path, like the current import errors.
- S6 — Update `plantilla.schema.json` (the `$schema` of the export) and any help or docs that describe the template JSON format.

- S7 — Everything in the template JSON is in Spanish:
  - the `unidades` list key `units` becomes `unidades`, and the stored data is migrated;
  - the catalog columns are shown in Spanish (`autor`, `titulo`, `anio`, `ciudad`, `editorial`, `isbn`, `codigo`) and the system translates them to the Koha names;
  - the export writes `"horas"` instead of `"número"` for hour columns.

  User (2026-11-26): «pero no podemos usar español? o si osi necesitamos inglés?» → «ok hazlo».

- S8 — Styles live only in `document`. The template has 115 inline `style="…"` in its HTML (e.g. `<th style="background:#C3D4EA;font-weight:bold">Autor</th>`). Remove those that just repeat what `document` already gives, so tables read `<th>Autor</th>`; the look of the preview, PDF and Word must not change. User (2026-11-26): «como manejamos los estilos y todo eso, en el json o qué?» → proposal «que los estilos vivan solo en document» → «ok, hagamoslo».
- S9 — The whole exported template JSON is in Spanish, keys and enumerated values alike. Example agreed with the user:
  ```json
  "documento": {
    "papel": "carta", "orientacion": "vertical", "margen_cm": 1.5,
    "letra": "Arial", "tamaños": { "titulo": 14, "seccion": 11, "texto": 11 },
    "colores": { "titulo": "#2F5496", "fondo_encabezado_tabla": "#C3D4EA", "borde_tabla": "#333333" },
    "titulo": { "texto": "PROGRAMA DE ASIGNATURA (SÍLABO)", "negrita": true, "alineacion": "centro" }
  }
  ```
  Renames: `sections`→`secciones`, `fields`→`campos`, `blocks`→`tablas`; `variables` stays. Values: `letter`→`carta`, `portrait`→`vertical`, `center`→`centro`, and so on. Import also accepts the English version, so old JSON files keep working. Nothing changes internally and there is no DB migration: only the export/import presentation changes. User (2026-11-26): «espera, pq esto está en inglés?» → «sí».
- S10 — The seed file `apps/api/src/server/configuration/officialTemplate.json` is itself written in the new format: Spanish and short-form tables, the same as the export, so that it reads in Spanish on GitHub. The internal definition it produces must stay identical. User (2026-11-26), with a screenshot of officialTemplate.json on GitHub: «porque lo veo en inglés?».

## Tasks

- [x] T1 (S1–S6) delegated writer (reason: context backstop of the parent session) — commit: 1263c46. RED: 6 of 7 new tests in `templateShortForm.test.ts` failed (the full-form import test already passed); GREEN: all 7 pass.

- [x] T2 (S7) delegated writer (context backstop); Risk item 1 (migration of stored data) → independent verifier — commit: 45e2895 + 853ebb2 (signatura). RED: 6 of 12 failed (two updated expectations, «unidades» export, «units» in a field document, Spanish catalog, «horas»; the «units» import test passed trivially until the rename and then failed when the alias was disabled); GREEN: 13 of 13 in `templateShortForm.test.ts`. Migration `20261126140000_lista_unidades` checked on a throwaway copy and applied to dev (see L5).
- [x] T3 (S8) delegated writer (context backstop); Risk item 1 (stored data migrated) and item 6 (Word output of plain headers) → independent verifier — commit: pending. RED: the DOCX plain-header test failed (no `<w:b w:val="1"/>`), the official export test failed (it still had `style=\"background:#C3D4EA;font-weight:bold\"`) and the web fixture test failed against the old fixture; GREEN: all pass (see L9).
- [x] T4 (S9) delegated writer (context backstop); Risk: item 3 (exported format; English still accepted) — commit: pending. RED: 11 of 19 in `templateShortForm.test.ts` failed (the 8 tests that read `tablas` plus the 3 new Spanish export, limit and mixed-language tests), and the new Spanish import test in `templateProvisioner.test.ts` and the updated golden export test in `templateReads.test.ts` failed; GREEN: all pass (see L11).
- [x] T5 (S10) delegated writer (context backstop); Risk: none (only the seed format changes; fixtures pin the internal definition and sections byte for byte) — commit: pending. RED: the new seed test in `officialTemplate.test.ts` failed (the seed had no `$schema` and was in English full form) while the two baseline fixture tests passed; GREEN: all 3 pass (see L13).

## Log

- L1 (2026-11-26, user): «y si mejoramos el formato del JSON para que sea más legible? porque cuando les mostré se asustaron cuando vieron un montón de cosas» → «no podríamos quita los bloques? y solo tener sectiones y campos, claro con las variables y el resto» → choice «Quitar 2, dejar 2», with the note: «es que verás, por eso te digo, sería algo ingenioso para no meter mucho código, que todo sea dentro de un JSON, primero veamos, cuales son los campos que te preocupan» → after seeing the short-form proposal: «ok, así está mucho mejor, lo entendiste».
- L2 — Map:
  - `definition.blocks` is a generic engine (label/value JSON Schema/rules/layout/catalog), and the 4 kinds are data.
  - Size in the export: unidades value 97 lines plus rules 95; bibliografia 57 + 17 + catalog 12; identificacion 43 + layout 23; evaluacion layout 19.
  - Export: `apps/api/src/server/configuration/templateReads.ts:113`.
  - Import validation: `templateDefinition.ts` and `blockDefinition.ts`.
  - Removing identificacion/evaluacion is no longer needed.
- L3 (2026-11-26, T1 writer) — Done:
  - Translation lives in `apps/api/src/server/configuration/templateShortForm.ts`. `shortBlock` writes the short form and `defineAnyBlock` reads it. `defineTemplate` sends every block through `defineAnyBlock`. A block counts as short when it has a short key (`titulo`, `propiedades`, `campos`, `reglas`, `catalogo`, `diseño`) and no full key. Import expands it into the internal shape and then runs the existing `defineBlock`. Error paths are translated to the short names, for example `blocks.x.campos.filas.columnas.tema.titulo`.
  - Short grammar:
    - a data item is `"texto"`, `"texto largo"`, `"número"`/`"horas"` or `"sí/no"`, or an object with `tipo` (default `texto`), `titulo`, `error`, `solo_si`, `max`, `min` and `decimales`;
    - `opciones` is written `{"clave": "Texto"}`;
    - a list is `{titulo, filas: "min-max", al_empezar, error, solo_si, columnas}` and a group is `{campos}`;
    - anything with `type` is a full schema;
    - rules go by catalog name or as a full object;
    - `catalogo` is `{lista, columnas}`.
  - The rule catalog is read from the rules in `officialTemplate.json` (six codes). The seed stays in the full form.
  - Deviation from the S1 example: the value key stays (`campos.units`), because the stored values use `units`/`libros`. Without it the list could not sit right under `unidades`.
  - The export uses the short form of a block only when it imports the same as the full form (`importsAlike` in `templateReads.ts`). Otherwise the block stays in the full form, so nothing is silently lost.
  - Size of the official `blocks`: 405 → 231 lines (`JSON.stringify(…, null, 2)`).
  - Checks:
    - api vitest: 159 files and 2350 tests pass;
    - web configuration and admin/plantilla tests: 12 files and 101 tests pass;
    - shared: 17 files and 156 tests pass;
    - tsc for api and web: 0 errors;
    - the export validates against `plantilla.schema.json` with ajv 2020, and so does an old full-form export.

- L4 (2026-11-26) — T1 committed as 1263c46. User: «pero no podemos usar español? o si osi necesitamos inglés?» → «ok hazlo» (S7).

- L5 (2026-11-26, T2 writer) — Done (S7):
  - `units` → `unidades` in `officialTemplate.json` (value key, 11 rule paths, layout repeat), `historicalFieldDocument.ts` and the api goldens (`block-golden`, `draft-golden`, `html-golden`, `template-golden`, `laravel-word-golden`). The AI resources had no `units`.
  - Legacy alias in `legacyUnits.ts`: `defineAnyBlock` renames `units` for the kind `unidades` (value or `campos`, rule paths `count`/`filled`/`sum`, layout repeat in HTML or nodes, catalog list), and `fieldDocument` renames the value of a `documentBlock` of kind `unidades` in imported field contents.
  - Catalog: export writes `autor, titulo, anio, ciudad, editorial, isbn, codigo`; import maps them to the Koha names and still accepts the English names. `call_number` has no Spanish name in S7 and stays as is. Unknown or repeated names give a Spanish error with the path `blocks.<kind>.catalogo.columnas`.
  - Hours: a number with maximum 999.99 and 2 decimals is exported as `"horas"`; `"número"` is still read the same.
  - Migration `20261126140000_lista_unidades` (SQL only, three `regexp_replace` on key/path patterns: `"value": {"units":`, `"count|filled|sum": "units[.\"]`, `"repeat": {"value": "units"}`) on `plantilla_silabo` (json), `definiciones_campo`, `valores_campo`, `propuestas_ia_plantilla` and `silabos`. Counts, identical on the throwaway copy (postgres:18, port 55497) and on dev: `units` 14/2/21/0/0 → 0/0/0/0/0; `unidades` 10/2/21 → 24/4/42; rows 1/46/438/0/21 unchanged; an md5 of the text with both words masked is identical before and after, so only the key changed. The template update bumps `plantilla_modificada_en` through its trigger.
  - Not migrated: `revisiones_silabo.contenido_enviado` (3 rows, 45 `units`) because each snapshot carries its own `template_definition` and `hash_contenido` fingerprints the content; a test renders a `units` snapshot through `snapshotDefinition`. `mensajes_ia_plantilla` (2 old chat messages) is history and stays.
  - Not renamed (outside the edit surface): `packages/shared/src/test/fixtures/template-definition.json` and `block-conformance.json` and the web/shared tests that read them (`DocumentBlock.test.tsx`, `FieldResponseEditor.test.tsx`, `blocks.test.ts`, `TeacherSyllabusDetailPage.test.tsx`). They use `units` in both the template and the values, so they stay consistent and pass; the engine is generic.
  - Checks: api vitest 2355/2356 (the one failure, `redis/lock.test.ts` timing, passes alone); web 175 files/1040 tests; shared 17/156; tsc api and web 0 errors; the export validates against `plantilla.schema.json` with ajv 2020.

- L6 (2026-11-26) — The independent verifier passed S1–S4 and S6. Blocker B1: the migration bumped `plantilla_modificada_en` through the triggers, which made `changedDuringPause` true. Fixed with the save/restore pattern used by earlier migrations, proven in a rolled-back transaction. On the dev DB the timestamp was set back to 06:42:47 (before the pause) and the migration checksum was updated. Advisories accepted:
  - stale `huella_definicion_campo` for unidades (not a teacher field);
  - pending AI proposals would go stale (0 in dev);
  - old AI chat messages still say `units` (the import alias covers it).
- L7 (2026-11-26) — T2 committed 45e2895; `call_number` → `signatura` 853ebb2. User asked for S8: «ok, hagamoslo».
- L8 (2026-11-26) — The T3 writer stopped with a decision: Word headers are bold only through the inline style. User chose «Negrita por defecto (Recomendado)»: Word makes plain table headers bold (headers without their own background, when `document.colors.table_header_background` is set). The 67 `background:#C3D4EA;font-weight:bold` styles are removed. The other 48 styles stay (alignment, other colours, unidades headers with coloured text). The two Laravel Word goldens («plantilla», «horizontal») get their plain headers regenerated as bold.

- L9 (2026-11-26, T3 writer) — Done (S8):
  - Inventory of the 115 inline styles in `officialTemplate.json`: 67 `background:#C3D4EA;font-weight:bold` on `th` removed (they repeat the document header). Kept 48: 21 `background:#C3D4EA;text-align:center` and 1 `background:#C3D4EA;text-align:right` on the unidades `th` (alignment, plus their text is `#365F91`, which the Word header colour would overwrite), 21 `color:#365F91` spans, 4 `text-align:center` on `td`, and 1 `background:#4F81BD;color:#FFFFFF;font-weight:bold` (FACULTAD header).
  - Word (`templateDocumentWord.ts`): a header without its own background is bold when `document.colors.table_header_background` is set, unless it has its own `bold`. The PDF is this DOCX through Gotenberg/LibreOffice. Web already showed `th` bold (browser default) with `--document-th-background`/`--document-th-color`.
  - Laravel Word goldens regenerated: only `word/document.xml` of «plantilla» (2 plain headers «Columna», «Elección») and «horizontal» (8 plain headers «H1», «R», «Lateral», «A») gained `<w:b w:val="1"/><w:bCs w:val="1"/>`; no other byte changed and the other 3 cases are unchanged.
  - Export: `style=` 117 → 50 (the export re-splits some spans, so it has 2 more than the seed's 115 → 48). An older JSON with the inline styles imports fine and keeps them as stored attributes.
  - Shared fixtures `template-definition.json` and `block-conformance.json`: the 54 redundant block headers each set to `backgroundColor`/`bold` null. The configuration goldens (`template-`, `html-`, `block-`, `draft-golden.json`) are self-contained Laravel parity inputs, not read from the seed, so they stay.
  - Migration `20261126150000_estilos_en_documento` (SQL only, recursive temp function, only for templates whose `text` equals `table_header_text`): headers whose background equals the template's `table_header_background`, with `bold: true`, no text colour, alignment or italic and no coloured text, get `backgroundColor`/`bold` null. Counts, identical on the throwaway copy (postgres:18, port 55497) and on dev: redundant headers plantilla 57 / definiciones 19 / valores 126 → 0/0/0; plain headers 0/0/0 → 57/19/126; the 22 aligned and 1 blue headers stay; rows 1/46/438 and 3 revisions unchanged; md5 of all text and of everything except those two attributes unchanged; `revisiones_silabo` md5 unchanged; `plantilla_modificada_en` stays 06:42:47.363.
  - Not changed (outside the edit surface or out of scope): `repeatableTable.ts` still writes the header style for admin-designed tables; the AI resources `templateKnowledge.json` (6) and `escenarios.json` (8) still show it in examples.
  - Checks: api vitest 159 files/2360 tests; web 176/1051; shared 17/156; tsc api and web 0 errors.
- L10 (2026-11-26) — T3 code landed in 3bb7835, committed by the other session together with its malla work. The verifier passed the migration, Word/PDF, the in-sheet preview and the round trip. Blocker B1: outside `.template-sheet`, for example on the library review page, a bare `th` lost the header background. Fixed in `FreeTextContent.css`: a bare `th` gets `var(--document-th-background, #c3d4ea)` and bold, with the dark-mode colour rule extended to it. Advisories accepted: A1 stale fingerprint on contribucion_perfil (not a teacher field); A2 italic-only headers become bold in Word (none exist). Scratch and the pre-migration dump were removed.
- L11 (2026-11-26, T4 writer) — Done (S9):
  - Translation lives in `apps/api/src/server/configuration/templateSpanish.ts`: one key/value table walked in both directions. `templateExport` returns `templateInSpanish(...)`; `prepareDraft` runs `templateFromAnyLanguage` first, so every key and value is accepted in Spanish or English in any mix and the existing validation sees the internal shape; `importTemplateJsonOf` passes the errors through `errorsInSpanish` when the JSON has a Spanish root key (paths in the error keys and inside the messages, plus the enum values and key names those messages list).
  - Root: `version`→`versión`, `response_policy`→`politica_respuestas` (`protected`→`protegida`), `document`→`documento`, `blocks`→`tablas`, `required_sections`→`secciones_obligatorias`, `library_sections`→`secciones_biblioteca`, `teacher_fields`→`campos_docente`, `presets`→`contenidos_predefinidos` (`key`/`label`/`field`→`clave`/`etiqueta`/`campo`), `sections`→`secciones`; `variables` and `$schema` stay. Section `clave`, `titulo`, `orientacion` (`vertical`/`horizontal`), `campos`; field `clave`, `etiqueta`, `quien_llena`, `contenido`, `mostrar_si` (`respuesta`, `opciones`), `max_caracteres`. Variable `etiqueta`, `fuente` (31 sources, e.g. `identification.faculty`→`identificacion.facultad`, `identification.hours_ac`→`identificacion.horas_acd`), `ejemplo`, `formato` (`number`→`numero`), `igual_a`. `documento` follows the S9 example (`texto` for `body`, `opciones` for `choices`, `encabezado.logos[].fuente` `institucion`/`facultad`, alignments `izquierda`/`centro`/`derecha`/`justificado`, paper `carta`/`a4`/`oficio`).
  - Not translated: the blocks under `tablas` (short form already Spanish; the full-form fallback keeps its JSON Schema keys), field contents, texts, variable/section/field keys, `quien_llena` values. Draft-only root keys (`title`, `layout`, `lists`, `block_changes`) are not part of the export and stay English. The AI tools send their own version-1 English payload through `draftProblems`/`prepareDraft` (identity) and never read the export; the web JSON dialog passes the text through unchanged, so neither needed changes.
  - `plantilla.schema.json`: every object lists the Spanish and the English names and every enum both values, with `anyOf` required pairs, so the Spanish export, an old English short-form export, an old English full-form export and a mixed file validate with ajv 2020 (a bad `papel` is rejected).
  - Checks: api vitest 159 files/2366 tests; web configuration and admin/plantilla 12 files/102 tests; api tsc 0 errors. The equivalence test that imports the export now imports the Spanish one unchanged.
- L12 (2026-11-26) — The T4 verifier passed S9: English payloads are identical to the baseline for every prepareDraft caller, identifiers and free text are never altered, and the dev template round-trips. Advisory 1 (the same key in both languages was merged silently, risking data loss on import) is fixed: the import now rejects it with ««secciones» y «sections» son el mismo dato: deje solo uno.» at the Spanish path. Advisories 2–4 are accepted (error text may translate a user identifier; draft check of Spanish payloads, which the web does not send; `[]`→`{}`, already at the baseline).
- L13 (2026-11-26, T5 writer) — Done (S10):
  - `officialTemplate.json` is now exactly the Spanish export of the official template (`versión`, `politica_respuestas`, `documento`, `variables`, `tablas` in short form, …, `secciones`), 4-space indented: 1043 → 879 lines. `$schema` is kept as `./plantilla.schema.json` instead of the request URL of the export, so editors validate the seed against the schema beside it; the seed validates with ajv 2020.
  - `officialTemplate.ts` sends the seed through `prepareDraft` (which runs `templateFromAnyLanguage`) and reads the sections with `validatedSections`; `defineTemplate` expands the short `tablas` through `defineAnyBlock`. No second translator.
  - The six rules of the catalog moved to `ruleCatalog.json`; `RULE_CATALOG` reads it, with the same codes, order and content (checked byte for byte against the baseline).
  - Baseline at 2cc6565 captured in scratch and committed as `__fixtures__/official-definition.json` and `official-sections.json`; `officialTemplate.test.ts` compares `officialDefinition()` and `officialSections()` text-equal to them, the seed text-equal to `templateExport` (apart from `$schema`) and the rule names. The export of the official template is byte-identical to the baseline.
  - Only other reader of the JSON: `templateProvisioner.test.ts` (now `secciones`/`clave`/`campos`). Seeding, the provisioner, `snapshotDocuments`, `templateStore` and the AI tools use `officialDefinition`/`officialSections`, whose outputs are unchanged; no AI resource reads the seed.
  - Not changed (outside the edit surface): `docs/sistema.md` still says the rule names are «tomadas de `officialTemplate.json`»; they now come from `ruleCatalog.json`.
  - Checks: api vitest 160 files/2369 tests; api tsc 0 errors; web configuration and admin/plantilla 12 files/102 tests.
