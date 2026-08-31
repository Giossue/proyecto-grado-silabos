# I-25 — Plantilla institucional única

## Decisión de producto

La UEB utilizará una única plantilla institucional de sílabo para todas sus carreras.
La carrera aporta el contexto académico de cada convocatoria y sus fuentes, pero no cambia
la estructura del documento base. La plantilla conserva sus versiones publicadas y cada
convocatoria fija una versión publicada concreta.

La normativa nacional consultada regula el régimen académico y deja a cada IES el ejercicio
de su autonomía responsable; la unicidad de esta plantilla es una decisión institucional
del producto, no una conclusión automática de la LOES o del RRA.

## Trazabilidad

- RF-017..026; RN-009..012; CU-04; ADM-05..07.
- RNF-001, RNF-010, RNF-022 y RNF-025.
- UI: ADM-05..07.

## Plan

- [x] Retirar el alcance por carrera de la plantilla y proteger en base de datos una sola
  plantilla institucional actual.
- [x] Limitar la creación, listado y edición administrativa a la plantilla institucional.
- [x] Permitir que una convocatoria de cualquier carrera seleccione una versión publicada
  de esa plantilla.
- [x] Actualizar pruebas, especificación, modelo de dominio y trazabilidad.
- [x] Ejecutar verificaciones aplicables.

## Migración segura

Las plantillas existentes se conservan como registros heredados no institucionales para no
destruir versiones ni convocatorias históricas. Solo la nueva plantilla marcada como
institucional puede abrirse, publicarse o seleccionarse para nuevas convocatorias.
