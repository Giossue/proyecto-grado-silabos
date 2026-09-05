# I-47: Retirar procedencia SIANET no operativa

## Decisión

El responsable del producto decidió el 5 de septiembre de 2026 retirar los metadatos
de procedencia SIANET que no intervienen en los flujos actuales. La integración de
lectura/importación no forma parte del producto y el sistema ya opera con sus propios
códigos visibles y relaciones normalizadas.

I-48 reemplaza la parte de esta decisión relativa a `escuelas`: el nivel completo se
retira del producto junto con `carreras.escuela_id`.

## Alcance

- Retirar siete columnas sin lectura ni escritura operativa.
- Actualizar modelos, seeder, pruebas y documentación de dominio.
- Aplicar una migración irreversible con respaldo lógico previo en la base remota.

## Estado

Completado el 5 de septiembre de 2026.

## Verificación

- Migración fresca y seeder completados en PostgreSQL local aislado.
- `InstitutionalSchemaAlignmentTest`: 3 pruebas y 5 aserciones correctas.
- Las siete columnas no aparecen en el esquema local ni en el remoto después de migrar.
- La base remota aplicó además la migración pendiente I-46 de unicidad de proceso y
  convocatoria, en el lote 22.
- Pint y comprobación de tipos de Vue correctos. La puerta completa conserva bloqueos
  ajenos: ESLint inspecciona `temp/.venv`; PHPStan reporta ocho errores previos en
  vigencias/perfiles; y la suite completa tiene tres pruebas de arquitectura previas y
  una integración Redis sin servicio local.
