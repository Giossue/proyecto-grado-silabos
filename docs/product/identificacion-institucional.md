# Ficha de identificación institucional

La primera tabla del sílabo se llena sola. Nadie la diseña ni la escribe: el código la
arma desde la información académica y la pinta igual en la plantilla, el editor del
docente, la revisión y el Word. Este documento existe para que quien deba cambiarla
(un estudiante o docente en el futuro) sepa exactamente dónde tocar.

## Un solo archivo

`app/Modules/Syllabus/Application/IdentificationCard.php`

- `build(...)`: reúne los **valores** (de dónde sale cada dato).
- `grid(...)`: coloca los valores en la **cuadrícula** del formato oficial (9 columnas,
  celdas combinadas). Cada fila es una lista de celdas con texto, columnas que abarca
  (`span`), filas que abarca (`rows`) y estilo.
- `WIDTHS`: anchos de las 9 columnas, medidos del documento original.

Los tres dibujantes (`IdentificationCard.vue`, `SyllabusWordDocument::identification`,
y la hoja de la plantilla) solo leen la cuadrícula. No hay que tocarlos para mover una
celda o cambiar una etiqueta.

## De dónde sale cada dato

| Celda del formato | Clave en `build` | Origen |
|---|---|---|
| Facultad | `faculty` | `carreras.facultad_id` → `facultades.nombre` |
| Carrera | `career` | `mallas.carrera_id` → `carreras.nombre` |
| Modalidad de estudio | `modality` | `ofertas_academicas.modalidad_id` → `modalidades.nombre` (heredada de la materia o de la carrera al abrir la oferta, I-35) |
| Campus universitario | `campus` | `ofertas_academicas.campus_id` → `campus.nombre` |
| Asignatura | `subject` | `asignaturas.nombre` |
| Periodo académico | `period` | `ofertas_academicas.periodo_academico_id` → `periodos_academicos.nombre` |
| Ciclo | `cycle` | `asignaturas.ciclo` (número → «Séptimo») |
| Paralelo | `parallel` | `paralelos.codigo` de los alcances del expediente (`alcances_silabo`) |
| Jornada | `shift` | `paralelos.jornada` (matutina, vespertina, nocturna) |
| Código | `code` | `asignaturas.codigo_institucional` |
| Prerrequisitos | `prerequisites` | `requisitos_asignatura` con `tipo = prerrequisito` → código de la materia requerida |
| Correquisitos | `corequisites` | `requisitos_asignatura` con `tipo = correquisito` |
| Unidad de organización curricular | `organization_unit` | `asignaturas.unidad_organizacion_curricular`; marca X en Básica, Profesional o Titulación |
| Horas de docencia (ACD) | `hours_ac` | `asignaturas.horas_ac` |
| Horas prácticas (APE) | `hours_pae` | `asignaturas.horas_pae` |
| Horas autónomas (AA) | `hours_aa` | `asignaturas.horas_aa` |
| Total de horas por periodo | `total_hours` | `asignaturas.horas_totales` |
| Total, créditos | `credits` | `asignaturas.creditos` |
| Nombre del docente | `teacher` | `colaboradores_silabo` → `usuarios.nombre` |
| Correo institucional | `email` | `colaboradores_silabo` → `usuarios.correo_electronico` |
| Estudiantes con discapacidad (Sí/No, tipo, adaptación) | `disability`, `disability_type`, `disability_description` | Lo escribe el docente: campos `discapacidad_tiene`, `discapacidad_tipo`, `discapacidad_adaptacion` del bloque de identificación (`valores_campo`) |
| Formación y experiencia académica-investigativa | `formation` | Lo escribe el docente: campo `formacion_experiencia` del mismo bloque; última fila de la tabla |

Los campos que llena el docente viven en el mismo bloque «Identificación institucional»
de la plantilla (`IdentificationCard::INPUT_KEYS`): el editor los muestra debajo de la
ficha y la ficha impresa los coloca en sus filas.

Los datos de la malla y la oferta llegan por `contexto_academico` (copiado al abrir la
convocatoria por `AcademicContextSnapshot`). Paralelos y docentes se leen del
expediente en el momento. Al enviar una revisión, la ficha ya armada se guarda dentro
de la copia (`fotografia.identification`), y el Word se genera desde esa copia.

## Cómo cambiar algo

- **Renombrar una etiqueta**: editar el texto en `grid`.
- **Mover o combinar celdas**: cambiar `span` y `rows` en la fila correspondiente. La
  suma de `span` por fila debe dar 9 contando las celdas que vienen combinadas desde
  arriba.
- **Nuevo dato**: agregar la clave en `build` (y en `AcademicContextSnapshot` si sale
  de la malla o la oferta), luego una celda en `grid`.
- **Verificar**: `php artisan test tests/Feature/Syllabus/IdentificationCardTest.php`
  fija la cuadrícula; si el cambio es intencional, actualizar la prueba.
