# I-43: Eliminación de ofertas académicas

## Estado

Terminado.

## Trazabilidad

RF-008..016, RN-005..008, CU-03, COR-14, CP-F estructura académica.

## Decisión

La indicación explícita del responsable del producto (2026-09-03) reemplaza el
archivado de ofertas por eliminación. Una oferta puede borrarse si no posee alcance de
sílabo; la operación elimina también sus paralelos y asignaciones docentes sin historia.
Si existe un sílabo, se rechaza para conservar la trazabilidad institucional.

## Pasos

- [x] Acción autorizada, transaccional y auditada.
- [x] Ruta y confirmación de eliminación en COR-14.
- [x] Pruebas, documentación y verificación.

## Verificación

- `AcademicStructureTest` y `ManagementCreationUiTest`: 56 pruebas y 1482 aserciones.
- `./vendor/bin/pint --test`, `npm run types:check`, ESLint de los componentes
  modificados y `npm run build`.
