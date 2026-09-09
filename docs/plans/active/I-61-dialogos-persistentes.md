# I-61 — Diálogos persistentes y acciones reconocibles

## Estado

Implementado y verificado por decisión explícita del responsable del producto el
2026-09-09.

## Trazabilidad

RNF-018..023; UI-01..04; ADM-01..08; COR-01..08; DOC-01..10. No depende de
una decisión `POR VALIDAR` y no modifica permisos, estados ni datos.

## Resultado demostrable

Todos los diálogos del sistema exigen una acción explícita para cerrarse. No muestran
el botón `X`, no se descartan al pulsar el fondo ni con `Esc`, y su acción principal
incluye un icono que comunica guardar, confirmar, eliminar, reiniciar o continuar.

## Decisiones y supuestos

- «Modal» se concreta en el componente compartido `Dialog`; los paneles laterales
  `Sheet` conservan su patrón propio.
- Los botones secundarios de cancelación siguen cerrando mediante `DialogClose` o el
  estado controlado del componente.
- Los formularios y reglas de negocio permanecen sin cambios.

## Cambios previstos

- Dominio: ninguno.
- Backend: ninguno.
- Datos: ninguno.
- Frontend: cierre persistente en `DialogContent` y acciones principales con iconos.
- Seguridad/auditoría: sin cambios.
- Trabajos/integraciones: sin cambios.

## Pruebas

- Regresión arquitectónica del componente compartido.
- Pruebas focalizadas de interfaz existentes.
- Prettier, ESLint, TypeScript y build de Vite.
- Comprobación en Chromium de `X`, fondo, `Esc`, cancelación e icono principal.

## Pasos

- [x] Hacer persistentes los contenidos de diálogo compartidos.
- [x] Inventariar y completar los iconos de las acciones principales.
- [x] Añadir regresión automatizada del patrón global.
- [x] Actualizar trazabilidad y decisión durable.
- [x] Ejecutar verificaciones y registrar evidencia.

## Riesgos y reversión

El riesgo es dejar un diálogo sin salida explícita. El inventario verifica que cada
diálogo tenga una acción de cancelación, cierre, regreso o finalización antes de retirar
los cierres implícitos. La reversión consiste en restaurar los eventos predeterminados
del componente compartido, sin migraciones ni cambios de datos.

## Evidencia de cierre

- `DialogConventionTest` y `TemporaryPasswordDialogTest`: 5 pruebas y 32 aserciones.
- ESLint focalizado y `vue-tsc --noEmit`: aprobados.
- `vite build`: aprobado.
- `dialog-convention.mjs` en Chromium: confirma ausencia de cierre implícito por fondo
  y `Esc`, salida con «Cancelar» e icono en la acción principal.
- `composer verify` se ejecutó, pero la puerta global se detuvo en `format:check` por
  seis archivos ajenos a I-61 que ya tenían formato pendiente. La suite PHP completa
  dejó 393 de 396 pruebas aprobadas; sus tres fallos restantes corresponden a
  placeholders, botones secundarios de paneles `Sheet` y un estado vacío previos, no a
  los diálogos. Pint, lint global y las pruebas focalizadas de I-61 sí aprobaron.
