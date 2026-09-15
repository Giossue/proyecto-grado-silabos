# I-79 — Renombrar responsabilidades docentes a asignaciones de paralelo

## Alcance y trazabilidad

- RF-007..016, RN-005..008, CU-03, COR-14 y COR-15: la responsabilidad de docencia
  sobre un paralelo sigue siendo la misma relación operativa.
- CP-F estructura académica: se conserva la integridad entre el paralelo, la asignación
  RBAC docente y los colaboradores de sílabo.
- No depende de una decisión `POR VALIDAR`: es un ajuste de nomenclatura solicitado por
  el responsable del producto.

## Decisión

La tabla física `docentes_paralelo` pasa a llamarse `asignaciones_paralelo`. Describe
con mayor precisión una asignación operativa a un paralelo; la persona docente se deriva
de `asignaciones_rol` y no se duplica en esa tabla.

No cambia el contrato funcional de la aplicación: las pantallas, rutas, auditoría y el
modelo continúan llamando a la operación «asignación docente». Tampoco se renombran en
este incremento las columnas ni las claves foráneas que ya expresan su significado.

## Implementación

1. La migración `000071` renombra la tabla y sus índices y restricciones propios,
   preservando filas, claves foráneas y referencias desde `colaboradores_silabo`.
2. El modelo y las consultas SQL directas pasan a usar `asignaciones_paralelo`.
3. Las pruebas de estructura confirman que no persiste la tabla anterior.
4. La fotografía de producción solo se actualiza después de aplicar y comprobar la
   migración en la base remota.

## Verificación local

- `000071` aplicada en PostgreSQL local: existen `asignaciones_paralelo`, sus índices
  y sus restricciones renombradas; la FK desde `colaboradores_silabo` sigue apuntando a
  la tabla nueva.
- `AcademicStructureTest`, `ManagedUserTest`, `TeacherTransferTest`,
  `TeacherReliefTest` y `SpanishSchemaTest`: 77 pruebas y 912 aserciones correctas.
- `000071` aplicada en producción en el lote 44: la tabla, sus índices y restricciones
  tienen el nombre nuevo, y la FK de `colaboradores_silabo` continúa referenciándola.
  La fotografía de producción se actualizó con esa comprobación.
