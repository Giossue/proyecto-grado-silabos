# I-44: Congelamiento de convocatorias y eliminación controlada

## Estado

Terminado.

## Trazabilidad

RF-008..016, RF-034..036, RN-005..008, RN-017..019, CU-03, CU-06,
ADM-04, ADM-12, COR-02, COR-03, COR-11, COR-13, COR-14, COR-15.

## Decisión del responsable del producto

Mientras el proceso institucional y la convocatoria de una carrera están abiertos,
la configuración que sostiene los sílabos queda congelada. Administración solo puede
gestionar operación personal imprescindible; Coordinación solo puede aplicar el relevo
controlado de docentes. Para cambiar la base se pausa el alcance correspondiente. Los
cambios estructurales entonces muestran el impacto y eliminan, solo tras confirmación,
los sílabos sin envío ni evidencia de IA. Revisiones, aprobaciones, auditoría y evidencia
de IA nunca se eliminan.

«Archivar» deja de ser una acción de catálogo académico. Los registros sin dependencias
se eliminan; aquellos que forman historia se protegen y el sistema explica el bloqueo.
La inactivación de una cuenta o el cierre de un nombramiento sigue siendo una terminación
de vigencia, no un archivo ni un borrado histórico.

## Pasos

- [x] Congelar en servidor la estructura institucional y de carrera durante una convocatoria en curso.
- [x] Mantener el relevo docente como la única modificación operativa controlada.
- [x] Reemplazar acciones visibles de archivo por eliminación o por estados de vigencia claros.
- [x] Cubrir límites, confirmaciones, auditoría y regresiones con pruebas.
- [x] Actualizar modelo, pantallas y matriz de trazabilidad.

## Verificación

- `php artisan test --compact tests/Feature/Academic tests/Feature/Syllabus tests/Feature/Identity tests/Architecture/ManagementCreationUiTest.php`: 184 pruebas y 3.020 aserciones.
- `./vendor/bin/pint --test`, `npm run types:check`, ESLint focalizado y `npm run build` pasan.
- `composer types:check` conserva 12 errores preexistentes de I-42 en consultas
  `laborallyEffective` y contratos de identidad; no pertenecen a este cambio.
