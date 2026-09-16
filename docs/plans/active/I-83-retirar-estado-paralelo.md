# I-83: Retirar estado de paralelos

## Estado

Listo para publicar y aplicar la migración remota.

## Decisión

`paralelos` no conserva `paralelo_activo`. El período académico y la programación
determinan cuándo un paralelo puede operarse; antes de que exista historia se elimina,
y después se conserva como parte de la evidencia académica.

## Trazabilidad

RF-007..016, RN-005..008, CU-03 y COR-14..15. No depende de una puerta pendiente.

## Trabajo

1. [x] Retirar el estado de las reglas, acciones, consultas y contrato de interfaz.
2. [x] Sustituir la baja individual por la eliminación protegida del paralelo.
3. [x] Crear la migración compatible; aplicada en local y pendiente de publicación antes de
   aplicarla en producción.
4. [x] Actualizar pruebas. La fotografía de producción se actualiza después de la migración
   remota, para no describir un esquema que aún no existe allí.

## Verificación

- Migración `000075` aplicada en la base local.
- 75 pruebas focalizadas y 2.357 aserciones aprobadas.
- Pint, comprobación de tipos de Vue y compilación de producción aprobados.
