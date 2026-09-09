# I-45: Preparación unificada de período

## Estado

Terminado.

## Trazabilidad

RF-008..016, RN-005..008, CU-03, COR-14, UI-04.

## Decisión del responsable del producto

La programación de una asignatura y sus paralelos permanecen como entidades distintas.
Preparar período solo muestra materias sin programación para el período seleccionado y
crea uno o más paralelos con jornada individual. La acción de la materia programada
permite agregar otros más tarde. Ninguna omisión elimina programación, paralelo ni
historia. I-62 actualiza aquí el vocabulario sin alterar esta decisión funcional.

## Pasos

- [x] Aceptar y validar la preparación solo para materias aún no programadas del período.
- [x] Sustituir el panel mínimo por la hoja lateral amplia con paralelos y jornadas por materia.
- [x] Mantener Materias y paralelos como la única pantalla y crear un paralelo desde las acciones de cada materia programada.
- [x] Cubrir la operación y la interfaz con pruebas y actualizar pantallas/trazabilidad.

## Verificación

- `php artisan test --compact tests/Feature/Academic/AcademicStructureTest.php tests/Architecture/ManagementCreationUiTest.php`: 59 pruebas y 1.505 aserciones.
- `./vendor/bin/pint --test`, `npm run types:check`, ESLint focalizado,
  PHPStan focalizado y `npm run build` pasan.
