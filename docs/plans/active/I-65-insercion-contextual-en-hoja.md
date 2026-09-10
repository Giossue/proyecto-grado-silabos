# I-65 — Inserción contextual en la hoja

## Estado

Completado por solicitud explícita del responsable del producto el 2026-09-09 y
ajustado a un selector único el 2026-09-10.

## Trazabilidad

RF-017..026; RN-009..012; CU-04; ADM-06. No depende de una decisión `POR VALIDAR`
ni modifica permisos o persistencia.

## Resultado demostrable

Al seleccionar un campo o bloque en el modo de edición, aparece debajo un único control
`+` pequeño pero siempre visible. Aumenta ligeramente al pasar el cursor o enfocarlo y
abre un popover para elegir si se agrega un campo o un bloque en la posición indicada.

## Pasos

- [x] Reutilizar los creadores actuales mediante una variante de inserción compacta.
- [x] Ubicar inserción de campo tras el campo seleccionado y de bloque tras el bloque.
- [x] Cubrir el primer campo de un bloque vacío.
- [x] Unificar las dos alternativas en un solo control y popover contextual.
- [x] Verificar teclado, tooltip, posición y regresiones visuales.
- [x] Actualizar trazabilidad y decisión durable.

## Riesgos y reversión

Los controles podrían añadir ruido o alterar la paginación administrativa. Solo se
muestran para el elemento seleccionado y reutilizan las mutaciones existentes. La
reversión es exclusivamente de interfaz.

## Evidencia de cierre

- `tests/Browser/template-inline-insert.mjs`: interacción aprobada en Chromium.
- `ManagementCreationUiTest`: inventario estructural actualizado y aprobado.
- `npm run lint:check`, `npm run types:check` y `npm run build`: aprobados.
