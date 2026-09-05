# I-48: Estructura Facultad → Carrera

## Decisión

El responsable del producto decidió el 5 de septiembre de 2026 que el sistema no usa
el nivel `escuelas`: no es una extensión, un campus ni una entidad de gestión en los
flujos de sílabos. La estructura académica del producto queda como Facultad → Carrera;
las ubicaciones físicas se mantienen en `campus`.

## Alcance

- Eliminar `escuelas` y `carreras.escuela_id` junto con su restricción compuesta.
- Retirar el modelo, acciones, pruebas, auditoría y documentación que dependían de ese
  nivel.
- Aplicar una migración irreversible con respaldo lógico previo en la base remota.

## Estado

Completado el 5 de septiembre de 2026.

## Verificación

- Migración fresca y seeder correctos en PostgreSQL local aislado.
- `AcademicStructureTest` e `InstitutionalSchemaAlignmentTest`: 37 pruebas y 434
  aserciones correctas.
- La base remota no conserva `escuelas`, `carreras.escuela_id` ni la clave ajena
  compuesta; `carreras.facultad_id` continúa con su clave ajena.
- Pint correcto.
