# I-40: Paralelos masivos y jornada editable

## Estado

Sustituido en interfaz por I-45: ya no hay alta masiva visible. El contrato conserva
la operación atómica para usos internos ya cubiertos, pero Coordinación agrega un
paralelo por vez desde la acción de su oferta.

## Trazabilidad

RF-008..016, RN-005..008, CU-03, COR-14, CP-F estructura académica. No depende de
una decisión `POR VALIDAR`.

## Resultado demostrable

El contrato permite altas atómicas de varios paralelos para usos internos. La interfaz
actual crea un solo paralelo con jornada desde cada oferta; la edición vuelve a mostrar
la jornada. Cada alta conserva alcance por carrera y un evento de auditoría por
paralelo.

## Decisiones y supuestos

- La operación atómica, si se usa internamente, corresponde a paralelos de **una
  oferta**: una carga para varias ofertas requeriría decidir cómo se emparejan códigos,
  jornadas y docentes.
- Los códigos se escriben separados por coma, punto y coma o salto de línea. Un lote es
  atómico: si un código es inválido o ya existe, no se crea ninguno.
- «Preparar período» conserva su paralelo inicial `A`, decisión vigente de I-36; no es
  un valor predeterminado del formulario de carga masiva.
- El fin de un período no archiva todavía sus ofertas automáticamente. Ese comportamiento
  queda registrado como `DT-12` y no se altera en este incremento.

## Cambios previstos

- Backend: request, caso de uso, ruta y respuesta de creación masiva.
- Frontend: formulario de paralelos con lista de códigos y jornada compartida; corrección
  del selector de jornada en edición.
- Seguridad/auditoría: autorización y alcance por oferta en servidor, transacción y una
  auditoría por registro.
- Datos: sin migración.
- Documentación y trazabilidad: especificación, pantalla COR-14 y matriz.

## Pruebas

- Crea un lote, registra jornada y auditorías.
- Rechaza duplicados, incluidos los ya existentes, sin inserciones parciales.
- Rechaza una oferta de otra carrera.
- Comprueba la presencia del selector de jornada en la edición de paralelo.

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
  tests/Architecture/ManagementCreationUiTest.php`: 55 pruebas, 1476 aserciones.
- Pint, análisis estático focalizado de los archivos PHP, tipos Vue, ESLint focalizado y
  build de producción: correctos.
- La puerta completa no queda en verde por dos fallos ajenos a este incremento: ESLint
  incluye un archivo de terceros bajo `temp/.venv/`, y el análisis estático completo falla
  en `ManagedUserController.php:101`.
