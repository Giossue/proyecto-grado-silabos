# Migración de Sílabos UEB a React + TypeScript + Next.js + Redis

Objetivo: reemplazar la SPA Vue y, después, la API Laravel por una sola app Next.js, por partes y con el sistema funcionando en todo momento.
Rama: `main` del repositorio `web/` (sin remote, sin push). Entrega: commits por unidad de trabajo. Pruebas: Vitest + Testing Library; Playwright para e2e.
Copia de trabajo: `~/Documentos/proyecto-grado-silabos-nextjs/` (`backend/` y `frontend/` son copias de referencia sin remote; `web/` es la app nueva).

## Specs

- S1. «haz una copia de todo el sistema y trabajemos aquí mismo en la copia». La copia no puede desplegar: sin remote de GitHub (un push a `main` despliega en Dokploy).
- S2. Fase 1: «Frontend en Next.js + React, consumiendo la API de Laravel tal como está». Las rutas que Next.js no atiende se reenvían a Laravel con `rewrites` de tipo `fallback`. Mismo comportamiento visible que la SPA Vue (roles, pantallas, mensajes). UI con shadcn/ui (React); todo botón de solo ícono en `IconTooltip`; sin avisos nativos del navegador (`required` → `aria-required`).
- S3. El cliente de la API no se escribe de nuevo: se reusa el TypeScript sin Vue de la SPA (`src/api`, `src/types`, `src/lib`) y sus pruebas. (Cambio sobre el plan: Orval se descartó porque `openapi.json` tiene 17 esquemas para 151 operaciones y daría tipos genéricos; ver L5.)
- S4. Fase 2: «La API, módulo por módulo, a Next.js con Drizzle sobre la misma base». Esquema leído con `drizzle-kit pull` de la base local `silabos_ueb`; no se crean bases ni servidores paralelos. Laravel sigue atendiendo lo que aún no se migró.
- S5. Fase 3: «Redis entra al final, cuando se pasen las colas (con BullMQ)». Colas `critica`, `documentos`, `ia`, `general`; caché y bloqueos.
- S6. Sin comentarios en el código (solo anotaciones que lee una herramienta). Textos de la interfaz iguales a los de la SPA Vue.

Supuesto: en fase 1 Laravel corre en `http://127.0.0.1:8000` y Next.js en `http://localhost:3000`; Laravel debe aceptar ese origen como dominio stateful de Sanctum.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| T0 | S1 | inline | hecho: copia creada, remotes quitados | — |
| T1 | S2, S6 | inline | hecho: shadcn (radix-vega, neutral, lucide), Vitest, rewrites `fallback` a Laravel, lint | ver L6 |
| T2 | S3 | inline | hecho: `src/api`, `src/types`, `src/lib` copiados; `signal`/`useSignal` reemplaza `ref`; sesión, `latestRequest`, `usePurgeConfirmation`, `blocks/runtime` portados | ver L6 |
| T3 | S2 | inline | pendiente: shell (sidebar por rol, tema, notificaciones) + login y flujo de cuenta | — |
| T4 | S2 | por definir tras el mapa | pendiente: pantallas de Administración | — |
| T5 | S2 | por definir | pendiente: pantallas de Coordinación | — |
| T6 | S2 | por definir | pendiente: pantallas de Biblioteca | — |
| T7 | S2 | por definir | pendiente: pantallas de Docente (editor, firma `.p12`) | — |
| T8 | S2 | por definir | pendiente: e2e Playwright de los flujos principales | — |
| T9 | S4 | por definir | pendiente: Drizzle (`drizzle-kit pull`) + primer módulo de la API en Route Handlers | — |
| T10 | S4 | por definir | pendiente: resto de módulos de la API | — |
| T11 | S5 | por definir | pendiente: Redis + BullMQ, caché y bloqueos | — |

## Log

- L1 (2026-11-23): «Según documentaciones, qué tan complicado sería migrar de nuestros stack a: React, TS, Nextjs y Redis?» → «mmmm, hagamos la 2, no importa, hagamos el cambio, haz una copia de todo el sistema y trabajemos aquí mismo en la copia» → «pero me refiero, no hay algo en internet que me ayude o me diga como hacer las migraciones al otro stack más rápido?» → «ok, hazlo, hagamos eso nomás».
- L2: Plan aceptado: 1) frontend Next.js + React contra la API Laravel actual; 2) API módulo por módulo a Next.js con Drizzle sobre la misma base; 3) Redis con BullMQ al pasar las colas.
- L3: Copia creada en `~/Documentos/proyecto-grado-silabos-nextjs/` (1,5 GB). `git remote remove origin` en `backend/` y `frontend/`. App creada con `create-next-app@16.4.6` (React 19.3, Tailwind 4.3). Next.js 16 trae su documentación en `node_modules/next/dist/docs/`; `middleware` ahora se llama `proxy`.
- L4: La copia de Laravel corre en `127.0.0.1:8001` (`php artisan serve --port=8001`) con su `.env` apuntando a `localhost:3000` (`APP_URL`, primer `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`). Usa la misma base `silabos_ueb`; `storage/app/{private,public}` son enlaces al sistema original para que base y archivos sigan coherentes (el worker de colas del original procesa los trabajos). Next.js: `npx next dev --port 3000`, `LARAVEL_URL` en `.env.local`.
- L5: `openapi.json` trae 17 esquemas para 151 operaciones; los tipos reales están escritos a mano en `frontend/src/api/*.ts`, que no dependen de Vue. Reusarlos es más rápido y exacto que Orval.
- L6: Verificado: `tsc` limpio, ESLint limpio (se excluye `src/components/ui/**`, igual que en la SPA), Vitest 31 archivos / 124 pruebas pasan (las 29 copiadas + `signal` y `latestRequest`). Login de Administración por el proxy de Next.js: `csrf-cookie` 204, `login` 200, `session` 200 con rol `administrador`.
- L7: Lo que falta portar de la SPA: componentes `components/ui` personalizados (variantes y colores de la SPA; `globals.css` debe tomar los tokens de `frontend/src/styles.css`), `components/domain` (~15k líneas), layouts, `composables`, `state` y las 33 páginas (5,3k líneas). Siguiente: T3 (tema, shell y autenticación).
