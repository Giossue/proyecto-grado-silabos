# I-37: Modalidades fijas por norma e híbrida automática

## Estado

Implementado el 2026-09-03. Verificación al pie.

## Objetivo

Quitar el catálogo de modalidades: el Reglamento de Régimen Académico (arts. 70-74A)
define las únicas que existen (presencial, semipresencial, en línea, a distancia e
híbrida), así que no hay nada que Administración deba registrar. Y que «híbrida» no sea
una casilla que alguien olvida marcar: si Coordinación aparta materias de la modalidad
base, la carrera es híbrida y punto. Decisión del responsable del producto (2026-09-03):
«hasta un admin se puede equivocar».

## Trazabilidad

RF-007..016, RN-005..008, CU-03, ADM-04, COR-13, COR-14; CP-F estructura académica.
Sustituye la parte de catálogo de I-35.

## Diseño

- `StudyModality` (enum PHP, espejo en `resources/js/lib/studyModalities.ts`): cuatro
  valores elegibles y la etiqueta «Híbrida».
- Migración `000034`: columna `modalidad` (texto, valores fijos) en `carreras`
  (base aprobada), `asignaturas` (vacía = la de la carrera) y `ofertas_academicas`
  (copia heredada); se traduce lo que hubiera en el catálogo y se elimina la tabla
  `modalidades`. Desaparecen la pantalla, el menú, la entidad `modalidad` y su paso de
  puesta en marcha.
- `OfferingInheritance::modalityFor` = la de la materia si tiene, si no la de la
  carrera. `isHybrid` = alguna materia activa de la malla activa se aparta de la base;
  `labelFor` devuelve «Híbrida» en ese caso. ADM-04 muestra la etiqueta real y guarda
  la base.
- Admin no puede «corregir» una carrera híbrida cambiándole la base: si hay materias
  apartadas, `UpdateAcademicRecord` rechaza el cambio de modalidad con un mensaje que
  remite a Coordinación (renombrar o mover de facultad sigue permitido). La hoja de
  edición lo avisa antes de intentarlo.
- Materia (hoja lateral y formulario en línea): selector «Igual que la carrera
  (Presencial)» o una de las cuatro. El desglose muestra la modalidad efectiva; la
  tarjeta solo etiqueta a las apartadas.

## Verificación

`AcademicStructureTest` (carrera exige modalidad válida, oferta hereda, materia
apartada → carrera híbrida y oferta en línea); suite completa, phpstan, eslint, vue-tsc y
build en verde. Migración aplicada en local y producción (base vacía).
