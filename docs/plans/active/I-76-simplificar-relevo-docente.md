# I-76 — Simplificar el relevo docente

## Decisión

`docentes_paralelo` conserva únicamente la responsabilidad vigente de una asignación
RBAC docente sobre un paralelo. El relevo no registra `sustento_tipo`,
`sustento_numero` ni `sustento_fecha`.

## Alcance

- Retirar los tres campos del formulario, la solicitud HTTP, el caso de uso y auditoría.
- Eliminar las columnas con la migración `000061`.
- Mantener `asignacion_rol_id`, `paralelo_id`, `activo` y `asignado_en`.

## Seguridad de datos

La comprobación previa en producción del 14 de septiembre de 2026 encontró dos filas y
cero valores de sustento. La migración se detiene si otra instalación aún contiene esos
datos, para exigir su respaldo explícito antes de eliminarlos.

## Verificación

- Pruebas de relevo individual y global.
- Migración local.
- Comprobación de estado de migración en producción tras el despliegue.
