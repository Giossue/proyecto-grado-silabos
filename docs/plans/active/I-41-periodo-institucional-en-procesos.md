# I-41: Período institucional del proceso de sílabos

## Estado

Implementado y verificado de forma focalizada.

## Trazabilidad

RF-008..016, RF-034..036, RN-005..008, RN-017..019, CU-03, CU-06, ADM-04,
ADM-12, COR-03, COR-04, CP-F estructura y convocatoria.

## Resultado demostrable

Administración crea un período académico único para toda la universidad y, al preparar
un proceso de sílabos, debe seleccionarlo. Cada convocatoria de carrera hereda ese mismo
período del proceso: no puede elegir ni modificar otro.

## Decisión y conflicto resuelto

La indicación explícita del responsable del producto (2026-09-03) reemplaza la decisión
I-11 de períodos por carrera: el período académico real es institucional. La migración
consolida periodos por código únicamente si sus fechas coinciden; ante datos incompatibles
se detiene sin elegir uno silenciosamente.

## Cambios previstos

- Datos: período global único; `procesos_silabos.periodo_academico_id` obligatorio;
  trigger PostgreSQL que impide que una convocatoria difiera del período de su proceso.
- Backend: alta/edición de proceso valida el período activo; convocatoria lo hereda.
- Frontend: selector obligatorio en ADM-12, visualización en listado; se retira el
  selector de período de COR-03.
- Seguridad/auditoría: límites de rol existentes; cambio de período auditado y bloqueado
  cuando ya existan convocatorias.

## Pruebas

- Restricción global de código de período.
- Proceso requiere período y lo audita.
- Convocatoria hereda período; servidor y trigger rechazan discrepancias.
- Cambio de período de un proceso con convocatorias se rechaza.

## Pasos

- [x] Migración reversible y modelos.
- [x] Casos de uso, requests, consulta y auditoría.
- [x] Interfaz de Administración y Coordinación.
- [x] Pruebas y trazabilidad.

## Riesgos y reversión

Una base previa con el mismo código y fechas distintas no se puede consolidar con
seguridad: la migración falla antes de escribir. La reversión estructural restituye la
columna de carrera sin inventar una pertenencia histórica.

## Evidencia de cierre

`php artisan test` focalizado: 102 pruebas, 1,445 aserciones; incluye la restricción de
PostgreSQL y los consumidores que crean convocatorias. `npm run types:check`, ESLint
focalizado, PHPStan de los módulos y `npm run build` pasaron. La ejecución completa de
Pest mantiene una carrera previa de reconstrucción de la base `silabos_ueb_test` (tablas
`migraciones` creadas/eliminadas concurrentemente); la migración ahora elimina sus
funciones de trigger antes de recrearlas para no añadir otro residuo entre ejecuciones.
