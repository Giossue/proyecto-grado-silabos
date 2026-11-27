# Separar por mallas y paralelo en lista

Objetivo: en las pantallas de Coordinación y en los documentos de apoyo se elige una malla y se ve solo lo de esa malla; el código del paralelo se escoge de una lista. Rama: main (AGENTS.md). Entrega: un commit por tarea en main, sin PR. Pruebas: vitest en `apps/web`, `apps/api` y `packages/shared`.

## Specs

- S1 — Textual (2026-11-27, ventana «Paralelos y docentes de la materia»): «Me dijeron que acá sea desplegable». Precisión textual: «O sea quiero que sea como en malla, que se despliega» (con la captura del desplegable de la pantalla Malla). La casilla Paralelo (hoy texto «Ej. B») pasa a ser un desplegable como ese. Supuestos: ofrece las letras de la A a la Z sin las que ya no se puedan usar en esa materia; un paralelo ya guardado con otro código conserva su código al editarlo; el servidor, la importación y las acciones en lote no cambian.
- S2 — Textual: «Cuando le doy a editar malla también debe salirme el desplegable acá para cambiar entre mallas, en lo que es los ciclos, me dijeron». El editor de la malla muestra el mismo desplegable que la vista. Cambiar de malla con cambios sin guardar pide confirmación antes de descartarlos.
- S3 — Textual: «ACÁ También toca separar por mallas» (Proyecto de carrera por materia). Se elige una malla con el mismo desplegable y se ven solo sus ciclos, materias y contadores; por omisión, la misma que muestra la pantalla Malla (la vigente). La importación desde Excel no cambia.
- S4 — Textual: «y acá igual» (Materias y asignaciones). Se ve una malla a la vez con el mismo desplegable, en lugar de «Todas las mallas». Al cambiar de malla no queda seleccionado nada que no se vea, y ninguna acción en lote toca filas ocultas. Supuesto: la etiqueta de malla de cada fila sobra al ver una sola.
- S5 — Los documentos de apoyo se comparten entre todas las mallas: siguen siendo de la carrera, sin desplegable de malla (reemplaza la versión anterior; ver L7). Textual: «Mejor hagamos que los documentos se compartan entre mallas y ya».

## Tasks

- [x] T1 (S1–S4) — desplegables en las pantallas de Coordinación — delegada (contexto) — commit 0fa0ea9.
- [x] T2 (S5) — descartada: no requiere cambios (L7).

## Log

- L1 (2026-11-27) — pedido original, textual: «Cuánto te falta? Me dijeron que acá sea desplegable [ventana de paralelos] Cuando le doy a editar malla también debe salirme el desplegable acá [editor de malla] para cambiar entre mallas, en lo que es los ciclos, me dijeron ACÁ También toca separar por mallas [Proyecto de carrera] y acá igual [Materias y asignaciones] y acá en los documentos de apoyo [Documentos de apoyo]».
- L2 — Se propuso ver una malla a la vez empezando por la vigente y que el docente vea los documentos de las mallas en las que da clases; se preguntó por la casilla Paralelo y por documentos para todas las mallas.
- L3 — Respuesta textual: «1. O sea quiero que sea como en malla, que se despliega [desplegable de la pantalla Malla], no sé si viste 2. No, separado».
- L4 — Observado: `MallaToolbar` (components/domain/academic/curriculum) es el desplegable y la vista de Malla solo lo muestra fuera de edición; la ventana de paralelos es de una sola materia; `documentos_apoyo` solo guarda `carrera_id`.
- L5 (2026-11-27) — T1 hecha (0fa0ea9). web 1362/1362 (repetida por el agente principal) y api 2829/2829, tsc y lint limpios; capturas estáticas a 1440 y 390 px con datos simulados. Las dos pruebas de punta a punta que escribían el código del paralelo ahora eligen la primera letra libre (se listan con Playwright; no se ejecutaron). Decisiones: letras A–Z sin las ya usadas por la materia sin distinguir mayúsculas; un código distinto se ofrece tal como está; «Nueva malla» solo en la pantalla Malla; las listas ofrecen solo mallas abiertas porque la API no envía materias de las cerradas; Proyecto de carrera guarda la malla en `?malla=<código>`; en Materias, cambiar de malla limpia búsqueda, filtros y selección. Administración recibe los mismos cambios. Riesgo T1: 3 y 4.
- L6 — Para T2: el desplegable de Proyecto de carrera ya está entre las pestañas y su contenido (quitar `!documents &&` para mostrarlo en documentos) y esa pestaña debe ofrecer también las mallas cerradas para que sus documentos sigan visibles.
- L7 (2026-11-27) — «Mejor hagamos que los documentos se compartan entre mallas y ya». El escritor de T2 se detuvo antes de terminar; sus cambios sin commit se apartaron en `git stash` («descartado: documentos de apoyo por malla»), su migración no se aplicó a la base local y sus bases y carpetas temporales se eliminaron.
- L8 (2026-11-27) — Textual, sobre el editor de la malla: «y centra las materias acá, porque estan como que muy abajo». Causa: las filas medían fijo y las tarjetas crecen con el «Tamaño del texto» (en las capturas, 115 %). Las medidas verticales ahora salen de `canvasMetrics`; con las tarjetas dibujadas en Chrome sin ventana, la diferencia entre arriba y abajo fue de 2 a 4 px entre 100 % y 150 %. No se probó el lienzo completo en la aplicación en ejecución.

