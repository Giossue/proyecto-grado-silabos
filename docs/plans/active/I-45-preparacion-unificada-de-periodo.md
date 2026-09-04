# I-45: Preparación unificada de período

## Estado

Terminado.

## Trazabilidad

RF-008..016, RN-005..008, CU-03, COR-14, UI-04.

## Decisión del responsable del producto

La oferta académica y sus paralelos permanecen como entidades distintas, pero
Coordinación los configura en una misma operación de período. El panel de pantalla
completa inicia con todas las materias activas seleccionadas, permite excluir materias
sin borrarlas y asignar códigos/jornada por fila o de forma masiva. Solo se crean
ofertas y paralelos faltantes; nunca se elimina una oferta, paralelo ni historia por
omitir una fila.

## Pasos

- [x] Aceptar y validar la preparación por materia y paralelo en una sola transacción.
- [x] Sustituir el panel mínimo por la hoja lateral amplia con configuración masiva.
- [x] Mantener las tablas de Ofertas y Paralelos como consulta detallada.
- [x] Cubrir la operación y la interfaz con pruebas y actualizar pantallas/trazabilidad.

## Verificación

- `php artisan test --compact tests/Feature/Academic/AcademicStructureTest.php tests/Architecture/ManagementCreationUiTest.php`: 59 pruebas y 1.528 aserciones.
- `./vendor/bin/pint --test`, `npm run types:check`, ESLint focalizado,
  PHPStan focalizado y `npm run build` pasan.
