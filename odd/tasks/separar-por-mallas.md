# Separar por mallas y paralelo en lista

Objetivo: en las pantallas de Coordinación y en los documentos de apoyo se elige una malla y se ve solo lo de esa malla; el código del paralelo se escoge de una lista. Rama: main (AGENTS.md). Entrega: un commit por tarea en main, sin PR. Pruebas: vitest en `apps/web`, `apps/api` y `packages/shared`.

## Specs

- S1 — Textual (2026-11-27, ventana «Paralelos y docentes de la materia»): «Me dijeron que acá sea desplegable». Precisión textual: «O sea quiero que sea como en malla, que se despliega» (con la captura del desplegable de la pantalla Malla). La casilla Paralelo (hoy texto «Ej. B») pasa a ser un desplegable como ese. Supuestos: ofrece las letras de la A a la Z sin las que ya no se puedan usar en esa materia; un paralelo ya guardado con otro código conserva su código al editarlo; el servidor, la importación y las acciones en lote no cambian.
- S2 — Textual: «Cuando le doy a editar malla también debe salirme el desplegable acá para cambiar entre mallas, en lo que es los ciclos, me dijeron». El editor de la malla muestra el mismo desplegable que la vista. Cambiar de malla con cambios sin guardar pide confirmación antes de descartarlos.
- S3 — Textual: «ACÁ También toca separar por mallas» (Proyecto de carrera por materia). Se elige una malla con el mismo desplegable y se ven solo sus ciclos, materias y contadores; por omisión, la misma que muestra la pantalla Malla (la vigente). La importación desde Excel no cambia.
- S4 — Textual: «y acá igual» (Materias y asignaciones). Se ve una malla a la vez con el mismo desplegable, en lugar de «Todas las mallas». Al cambiar de malla no queda seleccionado nada que no se vea, y ninguna acción en lote toca filas ocultas. Supuesto: la etiqueta de malla de cada fila sobra al ver una sola.
- S5 — Textual: «y acá en los documentos de apoyo»; sobre un documento para todas las mallas: «No, separado». Cada documento de apoyo pertenece a una sola malla; no existe «Todas las mallas». Coordinación ve, sube y edita los documentos de la malla elegida. El docente ve solo los de las mallas en las que da clases, separados por malla, y dentro de un sílabo solo los de la malla de esa asignatura; el servidor tampoco le deja abrir los demás. Supuestos: los documentos que ya existen pasan a la malla vigente de su carrera; ninguno se borra ni deja de verse para Coordinación (tampoco al borrar una malla).

## Tasks

- [ ] T1 (S1–S4) — desplegables en las pantallas de Coordinación — delegada (contexto) — en curso.
- [ ] T2 (S5) — documentos de apoyo por malla (base, API, Coordinación y Docente) — delegada (contexto) — pendiente.

## Log

- L1 (2026-11-27) — pedido original, textual: «Cuánto te falta? Me dijeron que acá sea desplegable [ventana de paralelos] Cuando le doy a editar malla también debe salirme el desplegable acá [editor de malla] para cambiar entre mallas, en lo que es los ciclos, me dijeron ACÁ También toca separar por mallas [Proyecto de carrera] y acá igual [Materias y asignaciones] y acá en los documentos de apoyo [Documentos de apoyo]».
- L2 — Se propuso ver una malla a la vez empezando por la vigente y que el docente vea los documentos de las mallas en las que da clases; se preguntó por la casilla Paralelo y por documentos para todas las mallas.
- L3 — Respuesta textual: «1. O sea quiero que sea como en malla, que se despliega [desplegable de la pantalla Malla], no sé si viste 2. No, separado».
- L4 — Observado: `MallaToolbar` (components/domain/academic/curriculum) es el desplegable y la vista de Malla solo lo muestra fuera de edición; la ventana de paralelos es de una sola materia; `documentos_apoyo` solo guarda `carrera_id`.
