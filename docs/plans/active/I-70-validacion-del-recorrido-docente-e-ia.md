# I-70 — Validación del recorrido docente y la asistencia de IA

## Estado

Recorrido docente preparado en la base remota el 10 de septiembre de 2026. La
demostración real de IA requiere corregir los hallazgos indicados abajo.

## Trazabilidad

RF-037..054; RNF-013, RNF-016..017 y RNF-035..036; RN-015..016 y RN-020..024;
CU-07, CU-08; DOC-01..06. PV-13, PV-14 y PV-18 siguen impidiendo declarar un modelo,
infraestructura o umbrales finales.

## Preparación verificada

- [x] Base remota con migraciones al día y autenticación mediante `.pgpass`.
- [x] Período de demostración vigente con una materia programada y un paralelo.
- [x] Docente activo asignado a Inteligencia Artificial, paralelo A.
- [x] Proceso y convocatoria abiertos; entrega al final del quinto día en Ecuador.
- [x] Un sílabo en estado `sin_iniciar`, visible y arrancable por su docente.
- [x] Bloque institucional obligatorio restaurado desde la definición base y auditado.
- [x] Suite `AiAssistanceTest`: 9 pruebas y 114 aserciones aprobadas.

## Hallazgos antes de demostrar IA

- PostgreSQL no configura el adaptador de IA. El valor efectivo de `AI_DRIVER` en
  producción debe comprobarse en las variables de la aplicación y del worker.
- La única fuente fijada por la convocatoria está activa, pero no tiene contenido, por
  lo que cualquier análisis terminaría como no concluyente sin invocar el modelo.
- El controlador entrega `executions.*.estado`, mientras la página Vue lee
  `executions.*.status`; el estado, el indicador de proceso y el sondeo no se presentan
  correctamente después de crear una ejecución.
- La prueba de servidor conserva el nombre `estado` y no cubre el contrato que consume
  la página, por lo que actualmente no detecta esa divergencia.

## Próxima unidad vertical

Unificar el contrato de estado entre PHP y Vue con una prueba Inertia, preparar una
fuente académica real mediante Coordinación y comprobar el servicio HTTP de producción
junto con su worker antes de ejecutar la demostración.
