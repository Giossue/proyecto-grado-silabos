# I-50 — Simplificación de identidad y auditoría

## Decisión

La cuenta conserva su estado actual (`activo`). El historial de activación o
desactivación pertenece a `eventos_auditoria`; no se duplica en
`usuarios.desactivado_en`. La cédula de la antigua conciliación SIANET tampoco forma
parte de ningún caso de uso actual y se retira. `usuarios` mantiene únicamente
`creado_en`: los cambios se consultan en auditoría, por lo que no necesita
`actualizado_en`.

## Alcance

- Migración irreversible que elimina `desactivado_en`, `documento_identidad` y
  `actualizado_en` de `usuarios`, incluido el índice parcial de documento.
- Modelo, factories, seeders, controlador, ficha de cuenta y pruebas sin esas columnas.
- La desactivación sigue revocando sesiones, cerrando las relaciones pertinentes y
  registrando `usuario.desactivado`; la fecha queda en el evento de auditoría.

## Trazabilidad

RF-003..006 · RN-001..004 · CU-02 · ADM-02/ADM-03 · CP-F identidad, permiso e historial.

## Verificación ejecutada

1. Migración local `000040` aplicada tras respaldo lógico; las tres columnas no existen.
2. `ManagedUserTest` y `SpanishModelColumnsTest`: 24 pruebas, 947 aserciones; Pint y
   `npm run types:check` correctos.
3. Migración remota aplicada tras respaldo lógico; una comprobación de solo lectura
   confirmó que ninguna de las tres columnas existe.
