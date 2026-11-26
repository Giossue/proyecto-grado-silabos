# Template editor more like Word

Goal: the admin template visual editor (apps/web/src/components/domain/configuration/TemplateVisualBuilder.tsx and its tools) is reorganized like Word: a ribbon with tabs and labelled buttons, a side panel for field and table options, and the essentials on top. How the template is stored and the syllabi do not change. Branch: main (direct commits allowed). Runner: vitest (`apps/web`, `apps/api`).

## Specs

- S1 — A ribbon with tabs, like Word, with labelled, grouped buttons. Agreed with the user (2026-11-26):
  - **Inicio**: Deshacer, negrita, cursiva, subrayado, color, alineación, listas.
  - **Insertar**: Tabla, Dato automático (the variables, today `{ }`), Respuesta del docente, Contenido predefinido.
  - **Diseño**: Papel, orientación, márgenes, tipo y tamaños de letra, colores de tablas, títulos. This also covers the styles that today are JSON-only.
  - **Campo**: shown only when a field is selected: quién lo llena, límite de caracteres, «mostrar solo si…».
- S2 — Advanced options go in a separate panel: clicking a field or a table opens a panel on the right with its options, like Word's «Formato» panel. The sheet stays clean and options only show when needed.
- S3 — On top, only the essentials: Guardar, Vista previa and Ver como docente. Technical things like «Editar JSON» are hidden in a «Más» menu.
- S4 — Nothing changes in how the template is saved or in the syllabi; only the screen changes.
- S5 — The bugs found in the browser audit get fixed along the way:
  - «Editar JSON» opens the saved template, not the current draft. Its «Aplicar y reemplazar» saves immediately and throws away the builder draft with no warning. It must start from what is being edited, or warn clearly.
  - Console errors: an insert point `<div>` inside a `<p>` in an empty new section (around TemplateVisualBuilder.tsx:1136), `flushSync was called from inside a lifecycle method` when inserting a repeatable table, and `Blocked aria-hidden … descendant retained focus`.
  - The sticky toolbar covers the top of the sheet.

## Tasks

- [x] T1 (S1 Inicio/Insertar/Campo, S2, S3) — ribbon with tabs, right-side panel, «Más» menu. Route: delegated writer (context backstop). Commit: see L4
- [ ] T2 (S1 Diseño) — «Diseño» tab with every `documento` style: papel, orientación, márgenes, letra, interlineado, espacio entre párrafos, tamaños, colores, título y título de sección, alineación del texto, texto vacío. The builder draft must carry them to the server. Route: delegated writer. Risk: item 3 (draft payload contract). Commit: pending
- [ ] T3 (S5) — «Editar JSON» from the draft or with a warning, plus the console errors. Route: delegated writer or inline. Commit: pending

## Log

- L1 (2026-11-26, user): «ok, ahora el editor interactivo, si cumple todo? o sea puede hacer todo? estaría bueno que lo pruebes» → audit (see L2) → «además lo noto con un montón de configuraciones, no podemos hacerlo más parecido a word?» → proposal S1–S5 → «ok hagamoslo».
- L2 — Audit, done in the browser without saving.
  - The builder covers sections, fields, rich text, plain tables, variables, responses, conditions, limits and simple repeatable tables.
  - JSON-only today: every `documento` style except margins and the three font sizes; variables; creating presets; required and library sections; response policy; advanced tables (bibliografía, unidades, identificación can only be viewed).
  - `quien_llena` only offers institucional/carrera.
  - Today the toolbar is one row of about 20 unlabelled icons plus «Seleccione un campo», Guardar and preview.
  - The template had already been saved at 15:00 UTC through the Admin tab (assistant proposal plus JSON PUT), before the audit.
- L3 (2026-11-26) — T1 done (commit pending). Ribbon (shadcn Tabs, forceMount so every tool stays mounted) with tabs Inicio (groups Deshacer, Fuente, Párrafo), Insertar (Tablas: Tabla + Tabla repetible; Respuesta del docente; Contenido: Dato automático + Contenido predefinido), Diseño (Página: márgenes; Tamaños de letra) and a contextual tab «Campo» (or «Sección» for a section) shown only with a selection: Quién lo llena, Reglas (Límite de caracteres, Mostrar solo si…), Organizar. Right-side aside «Opciones del campo» opens on field click (quién lo llena, límite, condición, tablas repetibles Editar/Ver, Nueva tabla repetible), closable, hidden below lg. Top-right of the ribbon: Más (Editar JSON), Vista previa, Guardar; «Ver como docente» stays in the page header right above. The «Diseño» dialog and the presets submenu of «quién lo llena» were removed (moved to Diseño tab / Insertar). Ribbon is now a solid sticky band under the header (top-14) and sections use scroll-mt-48, so it no longer floats over the sheet (S5 sticky item). Same handlers; no payload change. Tests: TemplateRibbon.test.tsx plus updated builder/page tests; web suite 176 files / 1080 tests green, tsc and eslint clean. Browser checked without saving. Follow-ups outside T1 surfaces: lib/screenTours.ts still points at «Opciones avanzadas»; apps/api repeatableTable.ts reason text still says «Opciones avanzadas → Editar JSON».
