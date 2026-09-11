# I-69 — Paginación semántica del documento

## Estado

Verificado localmente por solicitud explícita del responsable del producto el 10 de
septiembre de 2026.

## Trazabilidad

RF-017..026, RF-037..044; RN-009..012, RN-020..024; CU-04, CU-07; ADM-06 y
DOC-04. No depende de una decisión `POR VALIDAR`; PV-07 conserva pendiente la
certificación visual del DOCX oficial y PV-19 la matriz de dispositivos reales.

## Resultado demostrable

La hoja administrativa corta tablas únicamente entre grupos completos de filas,
repite sus cabeceras al continuar y mantiene cada título junto al primer contenido.
Los bloques con varios campos pueden continuar en otra hoja sin moverse completos y
el texto extenso se divide por líneas visuales sin ocupar el espacio entre hojas.

## Unidad vertical

- [x] Aceptar que la ficha institucional use más de una hoja sin comprimirla.
- [x] Mantener juntas las filas enlazadas mediante `rowspan`.
- [x] Repetir las filas de cabecera cuando una tabla continúa en otra hoja.
- [x] Mantener el título de sección y el subtítulo de campo con su primer contenido.
- [x] Permitir saltos entre campos de un mismo bloque.
- [x] Dividir textos extensos por líneas visuales cuando un párrafo no cabe completo.
- [x] Conservar los saltos como presentación transitoria, fuera del documento guardado.
- [x] Verificar navegador, servidor, DOCX, TypeScript, lint y build.

## Riesgos

El paginador no debe duplicar contenido semántico, controles o identificadores ni
introducir separadores dentro del JSON persistido. Las cabeceras repetidas son copias
visuales inaccesibles y desechables; los campos editables mantienen un único control.

## Evidencia local

- `document-pagination.mjs` cubre ficha institucional multipágina, título con primer
  contenido, seis campos distribuidos, texto de 250 repeticiones, cabeceras repetidas y
  120 filas agrupadas por `rowspan`.
- `WordRendererTest` verifica `keepNext` para títulos y `tblHeader` para cabeceras DOCX.
- `template-visual-builder.mjs`, `template-table-content.mjs` y
  `template-document-editor.mjs` conservan edición, selección y guardado.
- Las suites Unit, Feature y Architecture completan 416 pruebas y 6.286 aserciones; la
  comprobación Integration requiere el servicio Redis externo de la estación.
