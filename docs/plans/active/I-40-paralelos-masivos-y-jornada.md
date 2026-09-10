# I-40: Paralelos masivos y jornada editable

## Estado

Sustituido en interfaz por I-45: ya no hay alta masiva visible. El contrato conserva
la operación atómica para usos internos ya cubiertos, pero Coordinación agrega un
paralelo por vez desde la acción de la materia programada.

## Trazabilidad

RF-008..016, RN-005..008, CU-03, COR-14, CP-F estructura académica. No depende de
una decisión `POR VALIDAR`.

## Resultado demostrable

El contrato permite altas atómicas de varios paralelos para usos internos. La interfaz
actual crea un solo paralelo con jornada desde cada materia programada. Su tabla muestra
código y jornada por paralelo, y la edición de la materia programada permite actualizar
las jornadas existentes de forma atómica. Cada alta o cambio conserva alcance por carrera
y un evento de auditoría por paralelo.

## Decisiones y supuestos

- La operación atómica, si se usa internamente, corresponde a paralelos de **una
  materia programada**: una carga para varias materias programadas requeriría decidir
  cómo se emparejan códigos, jornadas y docentes.
- Los códigos se escriben separados por coma, punto y coma o salto de línea. Un lote es
  atómico: si un código es inválido o ya existe, no se crea ninguno.
- «Preparar período» conserva su paralelo inicial `A`, decisión vigente de I-36; no es
  un valor predeterminado del formulario de carga masiva.
- El fin de un período no archiva todavía sus ofertas automáticamente. Ese comportamiento
  queda registrado como `DT-12` y no se altera en este incremento.

## Cambios previstos

- Backend: request, caso de uso, ruta y respuesta de creación masiva.
- Frontend: alta individual con jornada, detalle de código y jornada en la tabla, y
  selectores de jornada por paralelo en la edición de la materia programada.
- Seguridad/auditoría: autorización y alcance por materia programada en servidor,
  transacción y una auditoría por registro.
- Datos: sin migración.
- Documentación y trazabilidad: especificación, pantalla COR-14 y matriz.

## Pruebas

- Crea un lote, registra jornada y auditorías.
- Rechaza duplicados, incluidos los ya existentes, sin inserciones parciales.
- Rechaza una programación de otra carrera.
- Comprueba la presencia del selector de jornada en la edición de paralelo.
- Comprueba la consulta y edición auditada de jornadas desde la materia programada.

## Pasos

- [x] Implementar contrato, caso de uso y ruta.
- [x] Actualizar interfaz y tipos generados.
- [x] Cubrir flujo, alcance y atomicidad con pruebas.
- [x] Actualizar documentación y ejecutar verificaciones focalizadas.

## Riesgos y reversión

La operación interna puede crear varios registros; la transacción evita estados
parciales. Un paralelo sin dependencias puede eliminarse desde su menú; no se modifica
historia ni datos ya usados por un sílabo.

## Evidencia de cierre

- `php artisan test tests/Feature/Academic/AcademicStructureTest.php
  tests/Architecture/ManagementCreationUiTest.php`: 63 pruebas, 1740 aserciones.
- `composer verify`: 404 pruebas, 6054 aserciones; escaneo de secretos, ESLint,
  Prettier, tipos Vue, Pint, PHPStan y build de producción correctos.
