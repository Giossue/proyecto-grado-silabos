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

## Tasks

- [x] T1 (S1–S6) delegated writer (reason: context backstop of the parent session) — commit: 1263c46. RED: 6 of 7 new tests in `templateShortForm.test.ts` failed (the full-form import test already passed); GREEN: all 7 pass.

- [x] T2 (S7) delegated writer (context backstop); Risk item 1 (migration of stored data) → independent verifier — commit: pending. RED: 6 of 12 failed (two updated expectations, «unidades» export, «units» in a field document, Spanish catalog, «horas»; the «units» import test passed trivially until the rename and then failed when the alias was disabled); GREEN: 13 of 13 in `templateShortForm.test.ts`. Migration `20261126140000_lista_unidades` checked on a throwaway copy and applied to dev (see L5).

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
