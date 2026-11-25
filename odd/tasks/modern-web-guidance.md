# Modern Web Guidance

Objetivo: aplicar a la app las guías de Google Chrome «Modern Web Guidance» (objetivo Baseline 2024) en todo lo que se pueda, sin cambiar lo que el usuario ve salvo mejoras de accesibilidad, formularios y rendimiento.
Rama: `main` (repositorio privado `Giossue/proyecto-grado-silabos-nextjs`). Entrega: commits por unidad. Pruebas: Vitest, typecheck, lint y E2E de Playwright en la base local (sin respaldo ni restauración).

## Specs

- S1. «Todo lo que se pueda»: revisar la app con las guías (`pnpm dlx modern-web-guidance@latest list|search|retrieve|legacy-scan`) y aplicar lo que corresponda.
- S2. Se mantienen shadcn/Radix, los textos visibles y los codificadores canónicos (instantánea, hashes, firmas).

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| W1 | S1, S2 | inline | hecho: `legacy-scan` (19 hallazgos de JS) | — |
| W2 | S1, S2 | explorador (lectura) | en curso: HTML, accesibilidad, formularios, diálogos | — |
| W3 | S1, S2 | explorador (lectura) | en curso: CSS, rendimiento, metadatos | — |

## Log

- L1 (2026-11-25): «ok, ahora, para podemos usar el plugin de google?» → «Todo lo que se pueda».
- L2: W1. `legacy-scan src`: 14 copias de arreglo pasadas a `toSorted`/`toReversed`/`findLast` (todas sobre arreglos reales, incluido `Object.entries` en `canonicalJson`: mismo orden, mismo resultado), `Promise.withResolvers` en `useDiscardConfirmation`, `structuredClone` en el ayudante de pruebas de IA. Se conservan `JSON.parse(JSON.stringify())` de `fieldResponses.ts` y `TemplateVisualBuilder.tsx`: además de copiar, dejan el documento con forma JSON (sin `undefined`), que es lo que se guarda y compara. Vitest 2761/2761, typecheck OK.
