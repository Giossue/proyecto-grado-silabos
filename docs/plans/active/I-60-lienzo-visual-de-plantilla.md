# I-60 — Lienzo visual de plantilla

## Estado

En implementación desde el 2026-09-08 por decisión explícita del responsable del
producto.

## Objetivo

Reemplazar la hoja vacía de ADM-06 por un constructor local, fluido y visual construido
con Vue Flow. No expone bloques, campos, claves, roles académicos ni configuradores de
tabla especializados.

## Decisiones

- Un elemento visual es un nodo: título, texto, campo o tabla.
- Las tablas son cuadrículas genéricas editables directamente; no contienen ACD, APE,
  AA, semanas ni otra regla fija.
- Posición y contenido se guardan como JSON normalizado en el mapa de la plantilla.
- El canvas no destruye el esquema anterior ni revisiones históricas.
- Este incremento cubre diseño y persistencia del constructor; la proyección a sílabos,
  DOCX y PDF se conecta después contra este contrato estable.

## Criterios

- [ ] La página carga el lienzo Vue Flow sin menú lateral ni modal de estructura.
- [ ] Administración puede añadir, editar, mover, duplicar y retirar nodos.
- [ ] Una tabla permite editar celdas y agregar filas o columnas sin claves técnicas.
- [ ] El lienzo se guarda con autorización, bloqueo, auditoría, confirmación y huella.
- [ ] Los nodos guardados se recuperan al volver a la página.
- [ ] Pasan pruebas de servidor, tipos, lint, build y Chromium.
