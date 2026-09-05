# I-51 — Retiro de la vigencia laboral de cuentas

## Decisión

La relación laboral no se conoce de forma estable al crear ni administrar una cuenta, por
lo que `usuarios` no almacena fechas de inicio o fin. La disponibilidad actual depende de
`usuarios.activo` y del rol/asignación operativa que corresponda. Las fechas de un
nombramiento de coordinación se conservan: describen el cargo en una carrera, no la
cuenta.

## Alcance

- Migración irreversible para eliminar `usuarios.vigente_desde` y
  `usuarios.vigente_hasta`, junto con su `CHECK`.
- Sin fechas en la creación, edición, ficha, filtros de sesión, selección de docentes ni
  notificaciones.
- La auditoría conserva los cambios administrativos de la cuenta; las vigencias de
  coordinaciones no cambian.

## Trazabilidad

RF-003..016 · RN-001..008 · CU-02/CU-03 · ADM-02/ADM-03 · COR-15 · CP-F identidad y
estructura.

## Verificación ejecutada

1. Migración local aplicada después de respaldo lógico; ambas columnas ya no existen.
2. 67 pruebas de identidad, estructura, transferencia, revisión, IA y documentos
   pasaron; `npm run types:check` y Pint también.
3. Migración remota aplicada después de respaldo lógico; consulta de solo lectura
   confirmó la ausencia de las dos columnas.

La ejecución de `RequiredFieldsAndSheetFooterTest` encontró una expectativa obsoleta de
`source_ids` en la solicitud de convocatoria, ajena a I-51: las fuentes son automáticas
desde I-46 y no guarda relación con las fechas eliminadas.
