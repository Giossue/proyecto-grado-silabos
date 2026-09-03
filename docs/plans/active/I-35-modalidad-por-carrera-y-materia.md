# I-35: Modalidad por carrera y por materia

## Estado

Implementado el 2026-09-03. Verificación al pie. El mismo día I-37 retiró el catálogo de
modalidades (valores fijos del reglamento) y la marca «combina por asignatura»: ahora
cualquier materia puede apartarse y la carrera pasa a híbrida sola.

## Objetivo

Que la modalidad de estudio deje de elegirse a mano en cada oferta y salga de donde la
fija la norma: el CES aprueba cada carrera en una modalidad (Reglamento de Régimen
Académico, arts. 70-74) y una carrera híbrida combina modalidades materia por materia
(art. 74A, hasta el 49 % en otra modalidad según art. 60). La malla oficial de
Administración de Empresas (junio 2024) trae la columna «MODA» en cada materia.

## Trazabilidad

- RF-007..016 (estructura académica), RN-005..008, CU-03, ADM-04, COR-13, COR-14;
  CP-F estructura académica.
- Decisión del responsable del producto (2026-09-03): modalidad en la carrera, por
  materia solo si la modalidad de la carrera «combina por asignatura», y la oferta hereda.
- Investigación normativa del mismo día: la ley fija componentes ACD/APE/AA, unidades
  de organización curricular, créditos de 48 h y modalidad por carrera; no fija el
  dibujo de la malla ni el formato del sílabo (autonomía responsable, LOES art. 18).

## Modelo

| Dato | Dónde vive | Quién lo pone |
|---|---|---|
| Modalidad aprobada de la carrera | `carreras.modalidad_id` (obligatoria al crear y editar) | Administración, ADM-04 |
| «Combina por asignatura» (híbrida) | `modalidades.combina_por_asignatura` («Alcance: por materia») | Administración, ADM-04 |
| Modalidad de la materia | `asignaturas.modalidad_id`; obligatoria solo si la carrera combina, se descarta si no | Coordinación, COR-13 |
| Modalidad de la oferta | `ofertas_academicas.modalidad_id`, heredada por `OfferingModality::forSubject` | Nadie: se copia al crear o editar la oferta |

La oferta conserva su columna porque el sílabo copia de ahí la «modalidad de estudio o
aprendizaje» (`AcademicContextSnapshot`, ficha de identificación). Las ofertas ya
abiertas no cambian cuando cambia la modalidad de la carrera. La unicidad de la oferta
pasa a ser materia + periodo + campus.

## Plan

- [x] Migración `000032`: `modalidades.combina_por_asignatura`, `carreras.modalidad_id`,
      `asignaturas.modalidad_id` (claves foráneas con borrado restringido).
- [x] `OfferingModality` (Academic/Application): `perSubject`, `subjectModalityId` y
      `forSubject`, con errores legibles cuando la carrera no tiene modalidad o la
      materia de una carrera híbrida no tiene la suya.
- [x] Alta y edición de carrera piden la modalidad; alta y edición de modalidad piden el
      alcance; la tabla de carreras muestra la modalidad y la de modalidades el alcance.
- [x] Materia: campo «Modalidad» en la hoja, columna en el desglose y etiqueta en la
      tarjeta, solo cuando la carrera combina modalidades.
- [x] Oferta: sin selector de modalidad al crear ni al editar; la descripción explica de
      dónde sale. El listado la sigue mostrando.
- [x] Puesta en marcha: modalidades antes que carreras.
- [x] Pruebas: `AcademicStructureTest` (carrera sin modalidad rechazada, oferta hereda,
      carrera sin modalidad no abre ofertas, carrera híbrida exige modalidad por materia
      y la oferta la toma de la materia).

## Verificación

Suite completa, phpstan, eslint, vue-tsc y build en verde. En producción, tras migrar,
se asignó «En línea» a Administración de Empresas para que sus ofertas puedan abrirse.
