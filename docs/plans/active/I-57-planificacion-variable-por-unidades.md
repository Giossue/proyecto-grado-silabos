# I-57 — Planificación variable por unidades y semanas

## Estado

Implementación funcional completada el 2026-09-08. Pendiente únicamente la revisión
manual de interfaz y fidelidad institucional del DOCX (`PV-07`/`PV-19`).

## Objetivo

Representar la sección 6 del sílabo como una sola estructura institucional repetible:
Docencia agrega la cantidad de unidades y filas semanales que necesite, mientras el
sistema numera, suma y contrasta la planificación con las horas aprobadas de la materia.
La referencia visual es `temp/rev SÍLABO-IA-SW-2026.docx`, pero sus cuatro unidades de
cuatro semanas son datos de esa asignatura, no una cantidad fija de la plantilla.

## Sustento y decisión de producto

- El Manual de Procedimiento para la elaboración, seguimiento y evaluación del Sílabo
  UEB, aprobado el 8 de abril de 2025, indica que la sección describe cuántas unidades
  tiene el sílabo, las enumera secuencialmente (1, 2, 3, …) y programa semanalmente sus
  contenidos, horas, actividades y evaluación.
- El Reglamento de Régimen Académico del CES organiza la dedicación en ACD, APE y AA,
  reconoce 48 horas por crédito y deja a las IES distribuir las horas de sus períodos.
  No fija cuatro unidades temáticas ni las equipara a parciales.
- La malla es la autoridad para ACD, APE, AA y créditos de la asignatura. El sílabo
  distribuye esas horas; no modifica la carga académica aprobada.
- Unidad y parcial son conceptos independientes. Una evaluación parcial puede ubicarse
  en la fila semanal que corresponda sin cortar ni crear automáticamente una unidad.

Fuentes:

- <https://rdigital.ueb.edu.ec/items/e6e173c3-37d8-41d2-8e9f-fbfa54979bb1>
- <https://www.ces.gob.ec/wp-content/uploads/2025/05/Reglamento-de-Regimen-Academico.pdf>

## Alcance y trazabilidad

- RF-017..026, RF-037..044 y RF-066..074.
- RN-009..012, RN-020..024 y RN-031..034.
- CU-04, CU-07, CU-09 y CU-15.
- ADM-06, DOC-01..05, DOC-07..10 y COR-06.
- CP-F plantilla, borrador, validación, revisión y documentos; CP-N interfaz y
  compatibilidad.
- La fidelidad institucional final del DOCX sigue sujeta a PV-07. PV-08 quedó cerrada
  por confirmación explícita del responsable del producto el 2026-09-08.

## Modelo funcional

La tabla de planificación conserva una definición fija con:

- cabecera de unidad: número derivado, nombre y resultado de aprendizaje;
- filas semanales: contenido, semana, ACD, APE, AA, actividades ACD/APE/AA y evaluación;
- total por unidad: suma exacta de las filas de esa unidad;
- resumen general: suma de todas las unidades y comparación con la fotografía de la
  materia guardada en el sílabo.

Cada fila representa una semana. Una celda de contenido admite varios temas en líneas
separadas. Esta primera versión no introduce rangos ni listas anidadas de semanas.

## Reglas confirmadas para implementar

1. Docencia puede agregar y quitar unidades; el número se deriva de su posición y se
   renumera sin huecos.
2. Docencia puede agregar y quitar filas dentro de cada unidad.
3. La semana es un entero positivo y no se repite dentro de la planificación.
4. La cantidad de semanas no se escribe en el encabezado: Administración la declara al
   crear o editar el período académico y la planificación debe cubrir de 1 hasta ese valor.
5. ACD, APE y AA admiten valores no negativos con hasta dos decimales.
6. Los totales por unidad y generales se calculan; nunca se reciben como valores
   editables ni se persisten como fuente de verdad.
7. El borrador puede guardarse incompleto. Validar o enviar exige que los totales
   generales ACD, APE y AA coincidan con la fotografía de la materia.
8. Un desajuste identifica componente, planificado, esperado y diferencia; no se delega
   a una recomendación de IA.
9. Las revisiones conservan filas y contexto académico; Word y vistas calculan desde
   esa copia inmutable.

## Decisión confirmada — créditos (PV-08)

- el crédito mostrado sigue viniendo de la malla y no lo edita Docencia;
- se contrasta `ACD + APE + AA` con `créditos × 48`;
- un desacuerdo es error de configuración académica, no un dato que el docente corrija;
- se permiten horas con dos decimales y solo se redondea la presentación final.

El responsable confirmó autoridad, severidad y redondeo en conversación el 2026-09-08.

## Orientación y paginación

La referencia alterna páginas verticales y horizontales. El modelo vigente aplica una
orientación global, por lo que se incorporará orientación por bloque documental:

- la sección 6 inicia una sección horizontal al exportar;
- cada unidad empieza en página nueva horizontal;
- una unidad extensa puede continuar en páginas horizontales adicionales y repite sus
  cabeceras; no se reduce el texto para forzar una sola página;
- al terminar la sección 6, el documento vuelve a la orientación general;
- ADM-06 y las vistas de lectura representan la sección ancha sin producir scroll
  horizontal global.

La orientación por bloque se guarda como metadato validado de la plantilla y se copia en
la revisión; no se acepta CSS ni dimensiones arbitrarias.

## Plan de implementación

- [x] Extender el contrato de tabla para identificar las claves semánticas de semana y
      componentes horarios sin depender de etiquetas visibles.
- [x] Entregar al editor docente las horas esperadas desde `contexto_academico`.
- [x] Mejorar `SyllabusTableEditor`: unidades/filas variables, siguiente semana sugerida,
      resumen general y diferencias accesibles.
- [x] Validar en servidor forma de filas, unidades, semanas, decimales, duplicados y
      correspondencia ACD/APE/AA al ejecutar la validación determinística.
- [x] Conservar autoguardado incompleto y bloquear únicamente validación/envío cuando
      existan diferencias.
- [x] Mostrar el mismo resumen en revisión y documento sin guardar resultados derivados.
- [x] Añadir orientación por bloque a plantilla, snapshot y DOCX. La representación visual
      de hojas mixtas queda en la revisión manual del constructor.
- [x] Hacer que Word abra/cierre la sección horizontal y pagine unidades sin confundirlas
      con parciales.
- [ ] Completar la revisión humana de claro/oscuro, teclado y 360 px exigida por la DoD;
      las tres pruebas Chromium cubren esos recorridos automáticamente y dominio,
      petición, borrador, validación, snapshot y DOCX tienen pruebas automatizadas.
- [x] Actualizar `screens.md`, modelo de dominio, arquitectura frontend/documentos,
      normativa, pruebas, trazabilidad y pendientes.

## Criterios de aceptación

1. Una materia puede guardar una, dos, cuatro o más unidades sin cambiar la plantilla.
2. Agregar o quitar una unidad no duplica filas, no deja números huecos y conserva IDs
   estables de las demás filas.
3. Las semanas no están limitadas por el texto “Semanas (16)” y una semana duplicada se
   señala antes del envío.
4. Los totales por unidad y generales coinciden en editor, revisión y DOCX.
5. Con 32 ACD, 16 APE y 48 AA, una planificación 30/16/49 indica exactamente `faltan 2`
   y `sobra 1`; puede guardarse, pero no validarse ni enviarse.
6. Una planificación 32/16/48 supera la validación horaria sin depender de IA.
7. La tabla aparece horizontal y el resto del sílabo conserva la orientación general.
8. Más filas de las que caben en una página continúan sin recorte ni reducción ilegible.
9. Una revisión enviada conserva unidades, filas, sumas y orientación aunque cambie la
   plantilla posteriormente.
10. Los créditos son de solo lectura desde la malla; `total horas = créditos × 48` se
    valida sin redondear filas y con máximo dos decimales por entrada.

## Verificación ejecutada

- 87 pruebas focalizadas de Configuración, período académico, Sílabos, revisiones y
  documentos: 87 aprobadas, 1.356 aserciones.
- `composer types:check`: aprobado sin errores.
- `npm run types:check`: aprobado.
- ESLint focalizado en los archivos frontend de I-57: aprobado.
- `npm run build`: aprobado.
- `document-pagination.mjs`, `template-visual-builder.mjs` y
  `template-document-editor.mjs`: 3/3 aprobadas en Chromium temporal sin modificar las
  dependencias del proyecto. Cubren teclado, 360 px, superficies blancas en tema oscuro,
  paginación y el resumen neutral de la plantilla cuando aún no existe contexto de malla.
- Suite PHP completa: 389 pruebas aprobadas; la puerta global conserva tres fallos de
  arquitectura de interfaz ajenos a I-57 y no pudo completar la comprobación dependiente
  de Redis porque el servicio local no estaba disponible en `127.0.0.1:56379`.
- Queda pendiente la revisión humana de percepción y fidelidad institucional del DOCX
  vinculada a `PV-07`/`PV-19`; no es una brecha funcional conocida de I-57.

## Reversión

Los cambios de contrato son compatibles con tablas existentes. Revertir la
interfaz y los lectores no elimina filas del docente ni revisiones; cualquier migración
nueva tendrá reversión explícita y no reescribirá datos históricos.
