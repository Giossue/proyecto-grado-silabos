# I-36: Preparar periodo y campus de la carrera

## Estado

Implementado el 2026-09-03. Verificación al pie.

## Objetivo

Que arrancar un periodo no sea teclear la malla otra vez. Los sistemas académicos y los
LMS (Moodle, Canvas, Banner) tratan la oferta de un periodo como la malla completa y
cargan secciones desde el sistema de origen; aquí no hay importación, así que el
equivalente es un clic del coordinador. Observación del responsable del producto
(2026-09-03): elegir 39 materias de un desplegable era inviable.

## Trazabilidad

RF-007..016, RN-005..008, CU-03, ADM-04, COR-14; CP-F estructura académica. Depende de
I-35 (modalidad heredada).

## Decisiones

- **Campus de la carrera** (`carreras.campus_id`, migración `000033`, obligatorio al
  crear y editar en ADM-04). El CES aprueba cada carrera para una sede, igual que para
  una modalidad; la facultad no lleva campus. Las ofertas lo heredan y ya no lo piden.
- **Preparar periodo** (`POST coordinacion/estructura-academica/periodo/preparar`,
  `PreparePeriodRequest`, `PreparePeriod`): para el periodo elegido, toda materia
  activa de la malla activa queda con oferta (campus y modalidad heredados vía
  `OfferingInheritance`) y con un paralelo «A» si no tenía ninguno. Lo existente se
  respeta; repetirlo no duplica. Audita cada oferta y paralelo con `period_prepared`.
  El aviso dice cuántas ofertas y paralelos se crearon para cuántas materias.
- Las cohortes que no existen (carrera nueva o en cierre) se resuelven archivando la
  oferta sobrante, no eligiendo una por una.
- Cuando un curso se llena, «Agregar paralelo» B y asignar docente; la convocatoria ya
  admite un sílabo por paralelo o uno para todos los paralelos de la materia
  (`modo_agrupacion`).
- La ruta `coordination.academic.store` con `oferta` sigue existiendo (oferta suelta,
  hereda campus y modalidad), pero la interfaz de COR-14 solo ofrece «Preparar periodo».
- El lote de ofertas por casillas que se implementó horas antes se retiró: «Preparar
  periodo» lo vuelve innecesario.

## Verificación

`AcademicStructureTest::test_coordinator_prepares_a_period_for_the_whole_curriculum_in_one_click`
(crea, respeta lo existente, hereda campus y modalidad, rechaza carrera sin campus);
suite completa, phpstan, eslint, vue-tsc y build en verde. Migración aplicada en local y
producción; a Administración de Empresas se le asignó su campus.
