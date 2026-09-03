# I-42: Vigencia laboral de las cuentas

## Estado

Terminado.

## Trazabilidad

RF-003..016, RF-034..036, RN-001..008, RN-017..019, CU-02, CU-03, CU-06,
ADM-02, ADM-03, COR-15, CP-F identidad y estructura.

## Decisión

La vigencia laboral pertenece a `usuarios`, no a una asignación docente. La indicación
explícita del responsable del producto (2026-09-03) reemplaza las fechas por paralelo:
una misma persona trabaja desde/hasta una fecha para todos sus roles. Las fechas de
nombramiento de Coordinación se conservan porque describen el cargo y su carrera, no la
relación laboral general.

## Resultado demostrable

Administración registra la vigencia laboral al crear o editar cualquier cuenta. Un usuario
fuera de ella no puede operar ni ser elegido como docente; las asignaciones docentes solo
vinculan persona y paralelo, y se archivan al producirse un relevo.

## Migración

La migración transfiere a cada usuario con asignaciones docentes el inicio más temprano y
el fin más amplio (o abierto si alguna asignación era abierta), y luego elimina las fechas,
la exclusión por rango y el índice de vigencia de `asignaciones_docente`. Para cuentas sin
ese antecedente conserva fechas nulas: nulo significa vigencia laboral todavía no
registrada, no una baja inventada.

## Pasos

- [x] Migración, modelo y controles de acceso.
- [x] Casos de uso, validación y relevo.
- [x] Pantallas de cuenta y de asignación docente.
- [x] Pruebas y trazabilidad.

## Verificación

- `./vendor/bin/pint --test`
- 103 pruebas focalizadas y 1237 aserciones: identidad, estructura académica,
  convocatoria, relevo, transferencia y contratos de interfaz.
- `npm run types:check`, ESLint de los componentes modificados y `npm run build`.
- El lint global se detiene por errores preexistentes en
  `temp/.venv/lib/python3.14/.../emscripten_fetch_worker.js`, fuera del código del
  proyecto; esos archivos no se modificaron.
