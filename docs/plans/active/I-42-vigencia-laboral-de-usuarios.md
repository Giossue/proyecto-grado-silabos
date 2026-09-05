# I-42: Vigencia laboral de las cuentas

## Estado

Retirado por I-51 el 5 de septiembre de 2026.

## Trazabilidad

RF-003..016, RF-034..036, RN-001..008, RN-017..019, CU-02, CU-03, CU-06,
ADM-02, ADM-03, COR-15, CP-F identidad y estructura.

## Decisión

La vigencia laboral perteneció transitoriamente a `usuarios`, no a una asignación
docente. I-51 la retira porque esas fechas no se conocen de manera estable al gestionar
una cuenta. Las fechas de nombramiento de Coordinación se conservan porque describen el
cargo y su carrera, no una relación laboral general.

## Resultado demostrable

Este comportamiento fue sustituido: Administración activa o desactiva la cuenta; los
roles y asignaciones determinan su disponibilidad operativa. Las asignaciones docentes
solo vinculan persona y paralelo, y se desactivan al producirse un relevo.

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
