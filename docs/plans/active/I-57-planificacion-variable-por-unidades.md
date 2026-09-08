# I-57 — Planificación variable por unidades y semanas

## Estado

Plan creado el 2026-09-08. Implementación pendiente.

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
- La fidelidad institucional final del DOCX sigue sujeta a PV-07. PV-08 se resuelve solo
  para sumas de horas y contraste con la malla; la fórmula/redondeo de créditos queda
  pendiente hasta confirmación explícita.

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
4. La cantidad de semanas planificables no se escribe en el encabezado. Mientras el
   período no exponga un calendario lectivo estructurado, se toma de la mayor semana
   planificada y se presenta sin prometer un máximo institucional.
5. ACD, APE y AA admiten valores no negativos con hasta dos decimales.
6. Los totales por unidad y generales se calculan; nunca se reciben como valores
   editables ni se persisten como fuente de verdad.
7. El borrador puede guardarse incompleto. Validar o enviar exige que los totales
   generales ACD, APE y AA coincidan con la fotografía de la materia.
8. Un desajuste identifica componente, planificado, esperado y diferencia; no se delega
   a una recomendación de IA.
9. Las revisiones conservan filas y contexto académico; Word y vistas calculan desde
   esa copia inmutable.

## Decisión pendiente acotada — créditos (PV-08)

Propuesta del responsable técnico, aún por confirmar:

- el crédito mostrado sigue viniendo de la malla y no lo edita Docencia;
- se contrasta `ACD + APE + AA` con `créditos × 48`;
- un desacuerdo es error de configuración académica, no un dato que el docente corrija;
- se permiten horas con dos decimales y solo se redondea la presentación final.

No se codificará este contraste ni se cerrará PV-08 hasta que el responsable confirme
autoridad, severidad y redondeo.

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

- [ ] Extender el contrato de tabla para identificar las claves semánticas de semana y
      componentes horarios sin depender de etiquetas visibles.
- [ ] Entregar al editor docente las horas esperadas desde `contexto_academico`.
- [ ] Mejorar `SyllabusTableEditor`: unidades/filas variables, siguiente semana sugerida,
      resumen general y diferencias accesibles.
- [ ] Validar en servidor forma de filas, unidades, semanas, decimales, duplicados y
      correspondencia ACD/APE/AA al ejecutar la validación determinística.
- [ ] Conservar autoguardado incompleto y bloquear únicamente validación/envío cuando
      existan diferencias.
- [ ] Mostrar el mismo resumen en revisión y documento sin guardar resultados derivados.
- [ ] Añadir orientación por bloque a plantilla, snapshot, previsualización y DOCX.
- [ ] Hacer que Word abra/cierre la sección horizontal y pagine unidades sin confundirlas
      con parciales.
- [ ] Cubrir dominio, petición, borrador, validación, snapshot, revisión, DOCX, claro/
      oscuro, teclado y 360 px con datos sintéticos.
- [ ] Actualizar `screens.md`, modelo de dominio, arquitectura frontend/documentos,
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
10. No se calculan ni redondean créditos mientras la parte pendiente de PV-08 no haya
    sido confirmada.

## Verificación prevista

- `./vendor/bin/pint --test`
- pruebas focalizadas de Configuración, Sílabos y Documentos;
- `npm run lint:check`
- `npm run format:check`
- `npm run types:check`
- `npm run build`
- pruebas de navegador focalizadas de plantilla/paginación;
- `composer verify` al cerrar el incremento con PostgreSQL y Redis activos.

## Reversión

Los cambios de contrato se diseñarán compatibles con tablas existentes. Revertir la
interfaz y los lectores no elimina filas del docente ni revisiones; cualquier migración
nueva tendrá reversión explícita y no reescribirá datos históricos.
