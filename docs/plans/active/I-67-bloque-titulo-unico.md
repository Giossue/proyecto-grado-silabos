# I-67 — Bloque único de título

## Autoridad y alcance

2026-09-10: el responsable pide que el título principal deje de estar escrito en la
vista y sea una pieza única del documento, siempre ubicada al inicio. Alcance:
RF-017..026; RN-009..012; CU-04; ADM-06, DOC-01 y COR-06. No depende de una decisión
`POR VALIDAR` ni cambia permisos o estados.

## Contrato

- `mapeo_documento.title_block` guarda un único texto validado; las plantillas y
  snapshots anteriores usan el título institucional predeterminado.
- El constructor lo proyecta una sola vez, antes de las secciones. Puede seleccionarse
  y editarse, pero no eliminarse, duplicarse, reordenarse ni recibir campos.
- Vista normal y DOCX leen el mismo valor congelado en la revisión.

## Plan y aceptación

- [x] Dominio, guardado autorizado, auditoría y compatibilidad anterior.
- [x] Selección y edición desde la cinta, sin acciones de alta, borrado o movimiento.
- [x] Vista, snapshot, DOCX y PDF usan el bloque persistido.
- [x] Pruebas PHP, TypeScript, ESLint, build y navegador afectado.

## Verificación

47 pruebas PHP afectadas pasan con 1.545 aserciones; TypeScript y ESLint pasan. La
suite Chromium confirma un solo bloque, edición desde la cinta, ausencia de eliminar y
su posición anterior a la primera sección. Sin migración: el mapa JSON conserva
compatibilidad por valor predeterminado.
