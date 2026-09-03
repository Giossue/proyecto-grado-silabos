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
- [x] Diseñador sobre la hoja (`TemplateTableDesigner`), pensado como Word: al soltar una
      tabla aparece la galería de formatos institucionales (`tablePresets.ts`:
      planificación por unidades, bibliografía, escala de valoración, perfil de egreso,
      tabla simple); cada celda de cabecera tiene su menú (insertar a la derecha,
      combinar con la derecha, separar, texto/número, quitar) y se renombra con un clic;
      arrastrar reordena. Totales, «se repite por unidad», dato de cabecera y «elegir
      otro formato» viven en el menú ⋯ del campo. Sin barra de botones ni modo de
      selección (rechazados por el responsable del producto por complejos).
- [x] Cuadrícula del docente (`SyllabusTableEditor`): casilla por celda, unidades, totales
      calculados; validación de celdas escalares.
- [x] Vista de revisión (`SyllabusTableView`) con el esquema copiado en la revisión.
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
