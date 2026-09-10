# I-66 — Edición visual de la estructura de tablas

## Estado

Verificado localmente por solicitud explícita del responsable del producto el 10 de
septiembre de 2026. Sustituye la interacción de formulario confirmada en I-58, sin
cambiar su contrato de datos.

## Trazabilidad

RF-017..026, RF-037..044; RN-009..012, RN-020..024; CU-04, CU-07; ADM-06 y
DOC-04. No depende de una decisión `POR VALIDAR`.

## Resultado demostrable

Administración configura filas repetibles, datos de unidad, columnas y totales sobre la
propia tabla. La cinta muestra acciones según la celda o fila seleccionada y genera las
claves técnicas sin pedirlas. El formulario extenso «Configurar estructura» desaparece.

## Unidad vertical

- [x] Retirar el panel estructural que reconstruye el molde.
- [x] Permitir clasificar la fila seleccionada y activar unidades desde la cinta.
- [x] Insertar o reutilizar datos repetibles desde la celda seleccionada.
- [x] Derivar columnas, datos de unidad y totales al guardar el documento visual.
- [x] Conservar funciones semánticas y compatibilidad con diseños anteriores.
- [x] Cubrir servidor, TypeScript y recorrido Chromium.

## Riesgos

La geometría visual y el esquema docente deben guardarse de forma coherente. El servidor
seguirá normalizando el documento, verificando la huella y exigiendo confirmación cuando
exista trabajo en curso. No se crean migraciones ni se modifican revisiones enviadas.

## Evidencia local

- 37 pruebas de documento, esquema y plantilla: 355 aserciones.
- 26 pruebas del contrato de interfaz: 1.276 aserciones.
- `template-visual-builder.mjs` y `template-table-content.mjs` aprobadas en Chromium.
- TypeScript, ESLint focalizado, Pint, DOCX y build Vite aprobados.
