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
| `convocatorias_universidad` | Renombrar `procesos_silabos` para expresar que representa la convocatoria institucional administrada por la Universidad. | Migración `000042`, aplicada local y remotamente. |
| `convocatorias_carreras` | Renombrar `convocatorias` para distinguir el alcance operativo de cada carrera. | Migración `000042`, aplicada local y remotamente. |
| `convocatorias_universidad` y `convocatorias_carreras` | Retirar `nombre`; se deriva del período y, para la carrera, de la carrera relacionada. | Migración `000043`, aplicada local y remotamente. |
| `convocatorias_carreras` | Retirar `modo_agrupacion`; la regla universal confirmada es un sílabo por paralelo. | Migración `000044`, aplicada local y remotamente. |
| `convocatorias_universidad` | Retirar `creado_por`, `abierto_por`, `abierto_en`, `pausado_en`, `cerrado_en` y `actualizado_en`; el estado actual permanece y la historia de actores/transiciones vive en auditoría. | Migración `000045`, con respaldos verificados y aplicada local y remotamente. |
| `convocatorias_carreras` | Retirar `periodo_academico_id` y `plantilla_id`, heredados mediante `proceso_id`; retirar además actores, marcas de transición y `actualizado_en`, conservados en auditoría. La unicidad pasa a `carrera_id + proceso_id`. | Migración `000045`, con respaldos verificados y aplicada local y remotamente. |
| Trigger `validar_evidencia_ia` | Sustituir la referencia histórica a `convocatorias` por `convocatorias_carreras` para mantener la validación de alcance de fuentes. | Incluido en migración `000045`, verificado local y remotamente. |
| Todas las tablas de dominio | Retirar `creado_en`, `actualizado_en` y `registrado_en` cuando solo duplicaban auditoría técnica. Conservar las fechas que sí gobiernan o explican el negocio. | Migración `000046`, con respaldos verificados y aplicada local y remotamente. |
| Asignaciones, trabajos, notificaciones, objetos y observaciones | Conservar sus momentos funcionales renombrándolos a `asignado_en`, `encolado_en`, `notificado_en`, `almacenado_en` y `observado_en`. | Migración `000046`; modelos, consultas, interfaz, índices y triggers actualizados. |

## Evidencia de la migración `000046`

- Respaldo local: `/tmp/silabos-i52-000046-l5rs7x/local-pre-000046.dump`.
- Respaldo remoto: `/tmp/silabos-i52-000046-l5rs7x/remote-pre-000046.dump`.
- Ambos catálogos fueron validados con `pg_restore -l` antes de migrar.
- La base local y la remota devuelven cero columnas de dominio llamadas `creado_en`,
  `actualizado_en` o `registrado_en`.
- Las funciones PostgreSQL activas devuelven cero referencias `NEW`/`OLD` a esos nombres.
- 188 pruebas de los módulos afectados pasan antes de la aplicación remota.
- PHPStan, Vue TypeScript, ESLint sobre los archivos afectados, Prettier, Pint, el escaneo
  de secretos y la compilación Vite pasan.
- La suite completa deja 359 de 362 pruebas en verde; las tres fallas restantes son las
  comprobaciones de interfaz ya existentes sobre fuentes automáticas, iconos y estado
  vacío de `PeriodPreparationSheet`, ajenas a esta migración.
- El hash del inventario completo de tablas, columnas, tipos y nulabilidad coincide entre
  la base local y la remota después de migrar.

## Hallazgos pendientes de decisión

| Tabla | Función actual | Recomendación inicial |
|---|---|---|
| `sesiones` | Sesiones web de Laravel con driver `database`; permite cerrar todas las sesiones de una cuenta al desactivarla o reenviar credenciales. | Conservar mientras `SESSION_DRIVER=database`. Solo desaparecería al migrar el driver a Redis u otro almacenamiento, con una decisión explícita de operación y persistencia. |

## Pendiente de revisión

- Continuar por la siguiente tabla que indique el responsable del producto.
- Al cierre: comparación final local/remota, inventario de decisiones, prueba del esquema
  y actualización de la documentación de arquitectura.
