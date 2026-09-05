# I-52 — Revisión guiada del esquema local y remoto

## Estado

En curso. Solo el responsable del producto puede cerrarlo con la indicación explícita de
que terminó la revisión total.

## Propósito

Revisar tabla por tabla el esquema PostgreSQL local y remoto junto al responsable del
producto. Para cada campo se separa su función actual, la recomendación técnica y la
decisión de producto antes de modificar código o persistencia.

## Método

1. Consultar primero ambos esquemas en transacciones de solo lectura.
2. Explicar en lenguaje simple qué representa cada campo y dónde se usa.
3. Registrar la decisión: conservar, retirar, reemplazar o dejar pendiente.
4. Para cada retiro aprobado: migración nueva, ajuste vertical de código/interfaz/pruebas,
   respaldo lógico local y remoto, migración aislada y verificación posterior.
5. No cerrar este plan hasta la confirmación explícita de revisión total.

## Decisiones ejecutadas durante la revisión

| Tabla | Decisión | Implementación |
|---|---|---|
| `usuarios` | Retirar `desactivado_en`, `actualizado_en` y `documento_identidad`; el estado presente es `activo` y la historia queda en auditoría. | I-50, migración `000040`, aplicada local y remotamente. |
| `usuarios` | Retirar `vigente_desde` y `vigente_hasta`; esas fechas no se conocen de modo estable. La disponibilidad depende de cuenta activa y rol/asignación. | I-51, migración `000041`, aplicada local y remotamente. |

## Pendiente de revisión

- Continuar por la siguiente tabla que indique el responsable del producto.
- Al cierre: comparación final local/remota, inventario de decisiones, prueba del esquema
  y actualización de la documentación de arquitectura.
