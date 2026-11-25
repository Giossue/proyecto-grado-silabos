# Modern Web Guidance

Objetivo: aplicar a la app las guías de Google Chrome «Modern Web Guidance» (objetivo Baseline 2024) en todo lo que se pueda, sin cambiar lo que el usuario ve salvo mejoras de accesibilidad, formularios y rendimiento.
Rama: `main` (repositorio privado `Giossue/proyecto-grado-silabos-nextjs`). Entrega: commits por unidad. Pruebas: Vitest, typecheck, lint y E2E de Playwright en la base local (sin respaldo ni restauración).

## Specs

- S1. «Todo lo que se pueda»: revisar la app con las guías (`pnpm dlx modern-web-guidance@latest list|search|retrieve|legacy-scan`) y aplicar lo que corresponda.
- S2. Se mantienen shadcn/Radix, los textos visibles y los codificadores canónicos (instantánea, hashes, firmas).
- S3. Botones de enviar: «Seguir la guía (Recomendado)» → el botón siempre se puede presionar; al enviar con algo vacío se marca el campo con su mensaje y el foco va a él. Se actualiza la regla de la lista de calidad.
- S4. Barras de desplazamiento: «Grosor normal (Recomendado por la guía)».
- S5. Tema: «Seguir al sistema (Recomendado)» → sin elección guardada, sigue el modo del sistema operativo; quien ya eligió lo conserva.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| W1 | S1, S2 | inline | hecho: `legacy-scan` (19 hallazgos de JS) | — |
| W3 | S1, S2 | explorador (lectura) | hecho: 14 hallazgos de CSS, rendimiento y metadatos | — |
| W2 | S1, S2 | explorador (lectura) | hecho: 11 hallazgos de HTML, accesibilidad y formularios | — |
| W4 | S1, S2, S4, S5 | escritor delegado (paralelo con W5; superficies disjuntas) | hecho | ver L4 |
| W5 | S1, S2 | escritor delegado (paralelo con W4; superficies disjuntas) | hecho | ver L4 |
| W6 | S3 | inline, después de W5 (mismos formularios) | hecho | ver L4 |

## Log

- L1 (2026-11-25): «ok, ahora, para podemos usar el plugin de google?» → «Todo lo que se pueda».
- L2: W1. `legacy-scan src`: 14 copias de arreglo pasadas a `toSorted`/`toReversed`/`findLast` (todas sobre arreglos reales, incluido `Object.entries` en `canonicalJson`: mismo orden, mismo resultado), `Promise.withResolvers` en `useDiscardConfirmation`, `structuredClone` en el ayudante de pruebas de IA. Se conservan `JSON.parse(JSON.stringify())` de `fieldResponses.ts` y `TemplateVisualBuilder.tsx`: además de copiar, dejan el documento con forma JSON (sin `undefined`), que es lo que se guarda y compara. Vitest 2761/2761, typecheck OK.
- L3 (2026-11-25): tres choques con reglas propias, preguntados al usuario: botones deshabilitados hasta completar (regla de `docs/quality/frontend-checklist.md` del repositorio anterior) → «Seguir la guía (Recomendado)»; barras delgadas → «Grosor normal (Recomendado por la guía)»; tema siempre claro → «Seguir al sistema (Recomendado)». Escritores en paralelo: W4 (CSS, rendimiento, metadatos, barras, tema) y W5 (títulos de pestaña, autocompletado, errores enlazados, regiones vivas, filas con enlace, `main` duplicado, menú de usuario, esqueleto).
- L4 (2026-11-25): W4 (manifiesto, script de preferencias antes de pintar, `color-scheme`, logos con prioridad, logo de 4 KB, driver.js/malla/editor cargados a demanda, `scrollBehavior()`, movimiento reducido acotado, `dvh`, `downloadJson`, barras de grosor normal con contraste ≥ 3:1, tema que sigue al sistema sin elección guardada). Saltado: señal de cancelación de TanStack Query (~30 funciones, poco beneficio). W5 (títulos de pestaña con la página, autocompletado de credenciales, errores enlazados con `Field`, foco en el primer error del servidor, `role="alert"` solo en alertas destructivas, filas con `Link` o `button` real, `main` duplicado, esqueleto sin región viva, `text-balance`). W6: `Button` ya no se deshabilita por campos faltantes (se borró `useFormIncomplete`); al enviar se marcan los campos y el foco va al primero; regla escrita en `AGENTS.md`. Además: el menú de usuario toma su nombre del texto visible (`data-user-menu` para recorridos y pruebas), error enlazado y texto viejo «Mantener la sesión iniciada» quitado en «Cerrar otras sesiones».
- L5 (2026-11-25): «quitemos nomás lo del pwa nomás» → se borraron `manifest.ts`, `InstallAppDialog`, `installApp.ts` y las opciones «Instalar aplicación». «Mira, cuando el paralelo es muy largo se ve así encima el texto de la casilla» → en Materias programadas la casilla del paralelo va al lado del código (antes, absoluta sobre el texto). La prueba E2E del editor espera a que cargue (ahora se carga a demanda). Typecheck, lint, Vitest 2775/2775, build y E2E completo 87/87. «TANTO?» → la suite completa solo al cerrar cambios grandes.
