# I-53: Paginación dinámica de la plantilla

## Solicitud y alcance

El 2026-09-06 el responsable del producto solicita distinguir las hojas del constructor
administrativo y adaptar su cantidad al contenido, sin fijarla para cada docente.
Se conserva carta vertical (21.59 × 27.94 cm) y márgenes de 2.5 cm de I-33.
Los saltos son presentación calculada en el navegador: no se persisten, no alteran
la estructura ni las revisiones y no fuerzan saltos en el DOCX. El editor docente sigue
siendo un formulario por secciones; este cambio afecta la hoja de ADM-06.

## Trazabilidad y puertas

RF-017..026; RN-009..012; CU-04; ADM-06; RNF de usabilidad y compatibilidad
(RNF-018..023, según mapa de requisitos); CP-F plantilla y CP-N interfaz, sin inventar
enunciados individuales. PV-07 (aceptación del formato) y PV-19 (dispositivos reales)
siguen abiertas; no bloquean corregir la presentación existente. El motor PDF sigue
pendiente según I-34. La vista no promete coincidencia exacta con Word/PDF.

## Plan

- [x] Hoja carta con separación y numeración, calculada a partir del DOM real.
- [x] Recalcular al cambiar contenido, tamaño, fuentes y tablas, sin perder foco.
- [x] Mantener títulos con contenido y cortar tablas en límites sin rowspan activo.
- [x] Mantener nodos/controles originales y solo lectura; scroll local en móvil.
- [x] Pruebas de navegador con crecimiento, reducción, tablas y renombrado.
- [x] Verificación del cambio, documentación y trazabilidad; incidencias globales abajo.

## Evidencia del 2026-09-06

- Chromium 151, viewport 1440 × 1000 y 360 × 800: pasa
  `tests/Browser/document-pagination.mjs`. Monta el constructor real con datos
  sintéticos; verifica carta (816 × 1056 px CSS), 14 secciones, reducción a una hoja,
  todos los contenidos dentro de márgenes, foco/Escape al renombrar, apertura y cierre
  de zonas de arrastre, menú, reordenamiento reactivo y solo lectura. Una tabla de
  120 filas con rowspan de tres filas se divide sin atravesar celdas ni perder filas.
- Captura de cuatro páginas revisada visualmente en Chromium. No sustituye PV-19.
- Tipos y build Vite pasan; Pint y Larastan pasan. ESLint del código, excluyendo
  `temp/**`, pasa; formato de los archivos modificados y `git diff --check` pasan.
- `ManagementCreationUiTest`: 24 pruebas, 1089 aserciones, pasa tras trasladar la
  comprobación de tipografía al componente que ahora la implementa. No se elimina
  el requisito de Arial ni el resto de los controles del constructor.
- `composer verify` se detiene en ESLint por un JavaScript de terceros bajo
  `temp/.venv/.../pip/_vendor/urllib3/contrib/emscripten/`.
  El formato general informa nueve archivos ajenos al cambio. La suite completa
  detectó además dos regresiones existentes en `PeriodPreparationSheet.vue`
  (`SecondaryButtonAppearanceTest` y `TableEmptyStateTest`). Esos archivos y el
  entorno virtual no se modificaron. La puerta completa no se declara aprobada.

## Límites y recuperación

No hay migraciones ni cambios de persistencia, permisos o exportación. La paginación
se calcula por unidades visuales (párrafos de muestra, elementos de lista y grupos de
filas); una unidad indivisible excepcionalmente mayor que una página conserva todo
su contenido visible. No se afirma un motor de composición Word/PDF ni se reemplaza
el formulario docente. La reversión consiste en restaurar el marco anterior de
`TemplateSheetEditor` y retirar el componente/ayuda de presentación; no requiere
transformar datos.
