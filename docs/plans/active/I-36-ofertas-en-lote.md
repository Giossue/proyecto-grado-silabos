# I-36: Ofertas en lote

## Estado

Implementado el 2026-09-03. Verificación al pie.

## Objetivo

Que el coordinador abra las ofertas de un periodo en una sola pasada: periodo y campus
una vez, materias marcadas por ciclo o una a una. Con 39 materias por malla, elegirlas de
un desplegable una por una era inviable (observación del responsable del producto).

## Trazabilidad

RF-007..016, RN-005..008, CU-03, COR-14; CP-F estructura académica. Depende de I-35
(la modalidad se hereda, así que el lote no la pregunta).

## Diseño

- `POST coordinacion/estructura-academica/ofertas/lote` (`coordination.academic.offerings.batch`)
  con `period_id`, `campus_id` y `subject_ids[]` (`StoreOfferingBatchRequest`: materias de
  la malla activa de la carrera, sin repetidos).
- `CreateOfferingBatch`: en una transacción, omite las materias que ya tienen oferta para
  ese periodo y campus, crea el resto con la modalidad heredada (`OfferingModality`) y
  audita cada oferta (`academico.oferta.creacion`, metadato `batch`). Devuelve creadas y
  omitidas; el aviso lo dice en palabras.
- `OfferingRecordSheet` (modo oferta) usa `useForm` y envía JSON: lista agrupada por ciclo
  con casilla de ciclo completo (estado indeterminado si hay parte), casillas por materia,
  buscador por código o nombre y botón «Abrir n ofertas». El modo paralelo no cambia.
- La ruta `coordination.academic.store` con `oferta` sigue existiendo (pruebas y
  compatibilidad), pero la interfaz ya no la usa para ofertas.

## Verificación

`AcademicStructureTest::test_coordinator_opens_offerings_in_batch_and_existing_ones_are_skipped`;
suite completa, phpstan, eslint, vue-tsc y build en verde.
