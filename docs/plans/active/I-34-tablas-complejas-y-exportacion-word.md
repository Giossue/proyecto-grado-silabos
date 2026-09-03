# I-34: Tablas complejas en la plantilla y exportación Word

## Estado

Implementado el 2026-09-02. Verificación al pie.

## Objetivo

Que el administrador arme tablas como la de «Distribución y planificación de las unidades
curriculares» (cabeceras combinadas en dos niveles, datos de unidad, totales, una tabla
por unidad) sin combinar celdas a mano, que el docente las llene como cuadrícula y que el
documento Word salga igual a la hoja.

## Trazabilidad

- RF-017..026 (plantilla), RF-034..044 (borrador), RF-045..050 (documentos);
  RN-009..012; CU-04, CU-06, CU-08; ADM-06, DOC-01..03; CP-F documentos.
- Decisión del responsable del producto (2026-09-02): exportar con PhpWord. Vue Flow no
  aplica: la tabla no tiene relaciones, solo columnas y orden.

## Cómo se descompone una tabla compleja

| Pieza | Qué es | Dónde vive |
|---|---|---|
| Columnas | Lista plana; cada una con clave, nombre y tipo (texto o número) | `configuracion.table.columns` del bloque |
| Grupo | Cabecera que abraza columnas vecinas (Docencia → ACD) | `columns[].group` + `table.groups` |
| Agrupamiento | Cabecera superior que abraza columnas y grupos vecinos (Horas por semana) | `columns[].band` + `table.bands` |
| Cabecera de unidad | Datos sueltos encima de la tabla (Nombre de la unidad, Resultados) | `table.header_fields`; valores en una fila `_kind = unit` |
| Totales | Fila final que suma las columnas numéricas | `table.totals` |
| Por unidad | La tabla entera se repite (Unidad 1, 2, 3) | `table.repeat`; cada fila lleva `_unit` |

Reglas (`TableLayout::normalize`): claves únicas, columnas de un grupo o agrupamiento
siempre vecinas, un grupo entero dentro de un solo agrupamiento, máximo dos niveles,
celdas combinadas solo en cabecera y totales. Las filas del docente guardan un valor por
columna en `filas_repetibles.datos`; la clave histórica `texto` sigue siendo la columna por
defecto de las tablas sin esquema y de las listas.

## Plan

- [x] `TableLayout` (dominio) con normalización y errores legibles; `UpdateTableLayout` y
      `PATCH plantilla/{template}/bloques/{block}/tabla` con confirmación de borrado.
- [x] Esquema en la página de plantilla, en el borrador docente y en la copia de cada
      revisión (`content_type` y `table` por bloque).
- [x] Tabla sobre la hoja (`TemplateTableDesigner`), deliberadamente simple: al soltar una
      tabla aparece la galería de formatos institucionales (`tablePresets.ts`:
      planificación por unidades, bibliografía, escala de valoración, perfil de egreso,
      tabla simple); después solo se renombran cabeceras con un clic y «Elegir otro
      formato» en el menú del campo. El diseñador interactivo (combinar, separar,
      insertar, arrastrar, tipo por menú) se retiró por decisión del responsable del
      producto (2026-09-02): otra tabla nueva = un preset en código, mismo criterio que
      la ficha de identificación. Escala por datos, no por diseñador.
- [x] Cuadrícula del docente (`SyllabusTableEditor`): casilla por celda, unidades, totales
      calculados; validación de celdas escalares.
- [x] Vista de revisión (`SyllabusTableView`) con el esquema copiado en la revisión.
- [x] Ficha de identificación institucional (`IdentificationCard`): primera tabla del
      formato, armada desde la malla, la oferta, los paralelos y los docentes
      (facultad, carrera, modalidad, campus, asignatura, periodo, ciclo, paralelo, código,
      unidad de organización, prerrequisitos, correquisitos, horas ACD/APE/AA, total,
      créditos, docente, correo). El bloque heredado «Asignatura» pasa a
      `content_type = institutional`; la hoja, el editor docente, la revisión y el Word
      la pintan fija. Se copia armada en cada revisión (`snapshot.identification`).
      Es la cuadrícula del formato oficial calcada (9 columnas, celdas combinadas,
      medidas con python-docx del sílabo IA-SW-2026); el mapa celda → columna de la base
      está en `docs/product/identificacion-institucional.md` y
      `IdentificationCardTest` fija la cuadrícula.
- [x] Plantilla por defecto = formato oficial: «Nueva plantilla» crea las doce secciones
      con sus campos, las tablas ya armadas (`TablePresets`, espejo PHP de
      `tablePresets.ts`) y la ficha de identificación con lo que llena el docente
      (`CreateSyllabusTemplate::BASELINE`) de inmediato, sin `Sheet`, y abre el
      constructor. Las bases local y de producción se dejaron solo con el administrador
      y el catálogo de roles (`temp/limpiar_bd.php`, con respaldo previo) el 2026-09-02.
- [x] Logos del encabezado (`InstitutionalLogos`): el de la universidad se reemplaza
      desde la plantilla (`POST admin/plantilla/logo`); el de cada facultad es
      obligatorio al crearla (`facultades.logo_ruta`, migración `000031`) y opcional al
      editarla. PNG sin fondo (regla `TransparentPng`, canal alfa); la medida no se
      exige: `InstitutionalLogos::fit` escala conservando la proporción y centra sobre
      lienzo transparente de 850 × 315 o 600 × 180 (decisión del responsable del
      producto, 2026-09-03: mejor ajustar que rechazar). Se sirven en `logos/institucion` y
      `logos/facultad/{id}`; el Word lee el archivo del disco privado. Sin subida,
      salen los de fábrica.
- [x] Jornada del paralelo (`paralelos.jornada`, migración `000030`: matutina,
      vespertina, nocturna; opcional) para completar la ficha. Se elige al crear o
      editar el paralelo. Los campos propios de la malla no llegan al sílabo.
- [x] `PhpWordDocumentRenderer`: DOCX con el estándar del impreso y tablas con
      `gridSpan`/`vMerge`; bytes reproducibles (fechas y `nsid` fijos). PDF sigue en
      texto plano de respaldo (`PlainTextPdf`).
- [x] Pruebas: `TableLayoutTest`, `TemplateAndSourceTest` (endpoint), `WordRendererTest`
      (cabeceras combinadas, unidades, totales, determinismo), `ConvocationAndDraftTest`
      (celdas por columna).

## Decisiones y alcance

- Un campo se reordena solo dentro de su bloque (I-33). Mover una columna la deja sin
  grupo salvo que quede entre dos vecinas del mismo grupo.
- Cambiar columnas exige pausa del proceso y confirma el borrado de sílabos en curso,
  igual que cualquier cambio estructural (I-32).
- Pendiente (DOC): motor de PDF con formato. PhpWord necesita dompdf/mpdf/tcpdf para PDF;
  no se añadió sin decisión del responsable del producto.

## Verificación

`TableLayoutTest` (3), `TemplateAndSourceTest` (14), `Documents` (WordRendererTest y
DocumentOperationsTest) y arquitectura (105) en verde; pint, phpstan, eslint, vue-tsc y
build sin errores. En navegador local: en «Datos generales» se agregaron ACD, APE y AA
como números, se agrupó APE+AA en «Estudiante» y ACD+Estudiante en «Horas por semana», se
activaron totales y por unidad, y todo persistió tras recargar. Como docente, con una
convocatoria demo abierta, se llenó la cabecera de unidad y dos filas (2, 1, 3 y 2, 1.5,
3): totales 4, 2.5 y 6 en pantalla; guardado automático; una celda por columna en
`filas_repetibles.datos`; «Agregar unidad» creó la Unidad 2 con su fila de cabecera.
