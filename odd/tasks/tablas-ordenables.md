# Tablas ordenables

Objetivo: que las tablas se puedan ordenar por columna siguiendo la guía `sortable-table` de Modern Web Guidance.
Rama: `main` (repositorio privado). Entrega: commits por unidad. Pruebas: Vitest, typecheck, lint; E2E de las pantallas tocadas (la suite completa al cerrar).

## Specs

- S1. «Me dijeron que donde haya elementos exista ordenadores o sea creo que se refieren a las tablas» → propuesta aceptada («genial»): encabezado ordenable reutilizable y hook conectado al buscador y filtros (ordena antes de paginar), en todas las tablas donde tenga sentido, solo columnas de datos; cada tabla conserva su orden actual hasta que el usuario elija otro; en celular (tarjetas) un selector «Ordenar por».
- S2. Guía `sortable-table`: botón dentro de cada `th` ordenable con el nombre de la columna; `aria-sort` solo en la columna ordenada; primer clic ascendente, repetir invierte, cambiar de columna vuelve a ascendente; foco se queda en el botón; textos con `Intl.Collator` (`numeric: true`, `sensitivity: "base"`), números y fechas por su valor; un único `role="status"` oculto anuncia «Ordenado por X, ascendente, N filas»; filas movidas por `key`, sin reconstruir; flecha decorativa con `aria-hidden`.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| O1 | S1, S2 | inline | hecho: `useTableSort` (6 pruebas), `SortableHead`/`SortStatus`/`SortSelect` (2 pruebas); el selector no cuenta como filtro activo en celular | — |
| O2 | S1 | explorador (lectura) | hecho: 23 tablas en 19 archivos (ver L2) | — |
| O3 | S1, S2 | escritor delegado (paralelo con O4; superficies disjuntas) | en curso: 9 tablas con datos en el cliente + «Ordenar por» en `ClientFilterBar` | — |
| O4 | S1, S2 | escritor delegado (paralelo con O3; superficies disjuntas) | en curso: 5 tablas paginadas en el servidor (parámetro `sort`/`dir` con lista blanca) | — |

## Log

- L1 (2026-11-25): «Me dijeron que donde haya elementos exista ordenadores o sea creo que se refieren a las tablas, que dice guia de Google» → se resumió la guía `sortable-table` y se propuso el plan → «genial».
- L2: mapa. Cliente (`useClientFilter` → `useClientPagination`): Convocatorias, Facultades, Carreras, Docentes, Materias programadas (orden por materia, subfilas de paralelos juntas), Documentos de apoyo, Seguimiento, Historial del docente, Historial por carrera (agrupado por período). Servidor (sin parámetro de orden hoy): Usuarios, Revisiones de Coordinación, Historial de Coordinación (agrupado por período), Revisiones de Biblioteca, Historial de Biblioteca. Sin orden: catálogo de Koha (relevancia), diálogos de importación y de paralelos, tablas de conteo, ficha y editores. `Table` arma las etiquetas de tarjeta con el `textContent` del `th`: el encabezado ordenable solo agrega un ícono sin texto.
