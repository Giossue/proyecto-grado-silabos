# I-37: Modalidades fijas por norma y excepciones por materia

## Estado

Implementado el 2026-09-03 y ajustado el 2026-09-05. Verificación al pie.

## Objetivo

Quitar el catálogo de modalidades: el Reglamento de Régimen Académico (arts. 70-74A)
define las únicas que existen (presencial, semipresencial, en línea y a distancia), así
que no hay nada que Administración deba registrar. La modalidad aprobada
por Administración es el dato base permanente de la carrera. Coordinación puede marcar
una modalidad distinta en una materia cuando corresponda, pero esa excepción no cambia
ni muestra una modalidad diferente para la carrera. Decisión del responsable del producto
(2026-09-05): no se infiere «híbrida» a partir de las materias.

## Trazabilidad

RF-007..016, RN-005..008, CU-03, ADM-04, COR-13, COR-14; CP-F estructura académica.
Sustituye la parte de catálogo de I-35.

## Diseño

- `StudyModality` (enum PHP, espejo en `resources/js/lib/studyModalities.ts`): cuatro
  valores elegibles.
- Migración `000034`: columna `modalidad` (texto, valores fijos) en `carreras`
  (base aprobada), `asignaturas` (vacía = la de la carrera) y `ofertas_academicas`
  (copia heredada); se traduce lo que hubiera en el catálogo y se elimina la tabla
  `modalidades`. Desaparecen la pantalla, el menú, la entidad `modalidad` y su paso de
  puesta en marcha.
- `OfferingInheritance::modalityFor` = la de la materia si tiene, si no la de la
  carrera. ADM-04 muestra siempre la base aprobada de la carrera.
- Una excepción de materia no bloquea ni recalifica la carrera: no hay estado, etiqueta
  o lógica automática «Híbrida».
- Materia (hoja lateral y formulario en línea): selector «Igual que la carrera
  (Presencial)» o una de las cuatro. El desglose muestra la modalidad efectiva; la
  tarjeta solo etiqueta a las apartadas.

## Verificación

`AcademicStructureTest` (carrera exige modalidad válida, oferta hereda y una excepción
de materia no altera la modalidad de la carrera); verificación puntual posterior al
ajuste. Migración aplicada en local y producción (base vacía).
