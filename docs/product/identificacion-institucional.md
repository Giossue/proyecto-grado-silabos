# Ficha de identificación institucional

La primera tabla parte del formato institucional. Administración puede modificarla
desde «Editar diseño» (I-56), sin cambiar código para mover celdas o etiquetas. Las
variables se llenan automáticamente; los espacios de discapacidad y formación los
completa Docencia. El diseño queda guardado dentro de la plantilla única.

## Fuentes de datos y formato inicial

`app/Modules/Syllabus/Application/IdentificationCard.php`

- `build(...)`: reúne los **valores** (de dónde sale cada dato).
- `grid(...)`: coloca los valores en la **cuadrícula** del formato oficial (9 columnas,
  celdas combinadas). Cada fila es una lista de celdas con texto, columnas que abarca
  (`span`), filas que abarca (`rows`) y estilo.
- `WIDTHS`: anchos de las 9 columnas, medidos del documento original.

`TemplateDocumentDefaults::identification` adapta esa cuadrícula inicial a un documento
editable, reemplazando datos por variables y campos. Se usa sin escritura cuando no
hay diseño guardado. Los lectores anteriores (`IdentificationCard.vue` y el lector
Word de identificación) se conservan para sílabos y revisiones anteriores sin diseño.

## De dónde sale cada dato

| Celda del formato | Clave en `build` | Origen |
|---|---|---|
| Facultad | `faculty` | `carreras.facultad_id` → `facultades.nombre` |
| Carrera | `career` | `mallas.carrera_id` → `carreras.nombre` |
| Modalidad de estudio | `modality` | `programaciones_asignatura.modalidad` (valor fijo del RRA, heredado de la materia o de la carrera al programarla; I-35, I-37, I-62) |
| Campus universitario | `campus` | `programaciones_asignatura.campus_id` → `campus.nombre` |
| Asignatura | `subject` | `asignaturas.nombre` |
| Periodo académico | `period` | `programaciones_asignatura.periodo_academico_id` → `periodos_academicos.nombre` |
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
de la plantilla (`IdentificationCard::INPUT_KEYS`). Con diseño guardado se completan
dentro de sus celdas; el lector anterior los sigue mostrando debajo de la ficha.

Los datos de la malla y la programación llegan por `contexto_academico` (copiado al abrir la
convocatoria por `AcademicContextSnapshot`). Paralelos y docentes se leen del
expediente en el momento. Al enviar una revisión, la ficha ya armada se guarda dentro
de la copia (`fotografia.identification`). Además se guardan el diseño de cada bloque
y `fotografia.template_variables`; la revisión y el Word no consultan el catálogo vivo
para reemplazar las variables de una revisión histórica.

## Cómo cambiar algo

- **Etiqueta, color o celdas**: Administración abre «Editar diseño», cambia el contenido
  o combina/separa celdas y pulsa «Guardar diseño».
- **Dato automático**: escribir `@` y elegir, por ejemplo, `nombre_carrera`,
  `nombre_facultad`, `nombre_docente` o `correo_docente`. El docente no los escribe.
- **Respuesta manual**: insertar un campo con nombre descriptivo y tipo de respuesta.
- **Nueva variable disponible**: editar únicamente `config/syllabus_variables.php` si
  la fuente ya está en la identificación o en el contexto académico. Cada entrada
  define clave descriptiva, etiqueta y `source`, por ejemplo `identification.career`.
  `equals` permite marcas X de opciones ya existentes. Reconstruir la caché de
  configuración en despliegue si está habilitada. No se cambia código Vue.
- **Nuevo dato aún inexistente**: primero incorporarlo a la fuente y a su snapshot;
  agregarlo al catálogo no inventa información ni autoriza consultas arbitrarias.
- **Verificar**: `TemplateDocumentTest`, `IdentificationCardTest` y `ReviewWorkflowTest`
  cubren cuadrícula inicial, datos, guardado y copias históricas.
