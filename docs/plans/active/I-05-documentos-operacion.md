# I-05: Documentos, notificaciones, informes y auditoría

## Estado

Implementado y verificado automáticamente el 2026-08-14.

## Trazabilidad

- RF-066 a RF-074; RN-031 a RN-034; CU-15 a CU-17.
- UI-03, DOC-10, COR-12, ADM-09 y ADM-10.
- RNF-006, RNF-008, RNF-013, RNF-017, RNF-024 a RNF-028 y RNF-034.
- PV-07, PV-11, PV-12, PV-15; DT-03 y DT-04.

## Resultado demostrable

Un docente o coordinador autorizado solicita un paquete DOCX/PDF desde una revisión
aprobada. Un trabajo idempotente genera ambos artefactos desde la misma entrada, los
guarda en almacenamiento privado, publica estado observable y reautoriza cada descarga.
Coordinación consulta indicadores filtrados por carrera. Administración diagnostica
trabajos y consulta auditoría append-only. Los eventos humanos producen notificaciones
internas mediante outbox sin depender de correo.

## Decisiones y puertas

- PV-07 impide afirmar fidelidad al DOCX oficial. DT-03 se implementa como puerto
  `DocumentRenderer` y renderer técnico `baseline-v1`; produce DOCX/PDF válidos y
  coherentes para demostrar el flujo, pero la interfaz y documentación lo identifican
  como formato provisional hasta el spike con la plantilla autorizada.
- PV-15 mantiene desactivado el correo institucional. I-05 entrega notificación interna
  durable; el outbox conserva el punto de extensión sin inventar destinatarios externos
  ni textos institucionales.
- PV-11 y PV-12 bloquean borrado/retención definitiva. No se implementa purga; objetos,
  artefactos, auditoría y notificaciones se conservan.
- DT-04 usa el disco privado de Laravel y nombres físicos generados. Ninguna ruta interna
  se entrega al navegador.
- Los informes usan conteos y estados confirmados; no fijan metas ni umbrales
  institucionales pendientes.

## Casos de uso

### CU-15 — Generar y descargar documentos

- Actor: Docente autorizado sobre su expediente o Coordinador dentro de su carrera.
- Precondición: revisión aprobada e inmutable.
- Efecto: solicitud idempotente, ejecución observable, DOCX/PDF con misma revisión,
  plantilla, renderer, fecha y huella; descarga privada reautorizada y auditada.

### CU-16 — Consultar avance e informes

- Actor: Coordinador con rol vigente en la carrera.
- Efecto: conteos por estado/convocatoria y detalle paginado calculados en PostgreSQL con el
  mismo filtro de alcance que los expedientes.

### CU-17 — Operar y auditar

- Actor: Administrador vigente.
- Efecto: listado seguro de trabajos, reintento explícito de fallos compatibles y consulta
  de eventos append-only sin payloads de cola, secretos ni contenido académico.

## Pasos

- [x] Crear esquema de objetos, artefactos, notificaciones y outbox.
- [x] Implementar puerto y renderer documental técnico provisional.
- [x] Implementar solicitud, job idempotente, almacenamiento y descarga privada.
- [x] Conectar outbox y notificaciones internas a transiciones críticas.
- [x] Construir UI-03, DOC-10, COR-12, ADM-09 y ADM-10.
- [x] Probar autorización lateral, retry, fallos, huellas y consistencia DOCX/PDF.
- [x] Actualizar trazabilidad y ejecutar `composer verify`.
- [ ] Validar manualmente documentos y accesibilidad; completar spike PV-07 en I-08.

## Riesgos y reversión

- El renderer está detrás de un puerto; sustituirlo no modifica revisiones ni artefactos
  previos, que conservan `renderer_version` y huella.
- Escrituras de archivo usan rutas determinísticas e idempotentes. Un fallo deja, como
  máximo, un archivo privado no publicado que el reintento sobrescribe; no se borra hasta
  resolver retención.
- Redis no es fuente de verdad: ejecución, outbox y artefacto permanecen en PostgreSQL y
  pueden reencolarse.
- Descargar vuelve a autorizar el artefacto y nunca acepta una ruta suministrada por el
  cliente.

## Evidencia de cierre

- Migración `2026_08_14_000007_create_document_and_operation_tables.php` y constraints
  PostgreSQL para relaciones, completitud e inmutabilidad.
- `DocumentOperationsTest`: 6 casos y 152 aserciones; `ReviewWorkflowTest` protege además
  la inserción del outbox en las cuatro transiciones humanas críticas.
- Análisis focalizado de PHP/Larastan, tipado Vue y ESLint aprobados durante el desarrollo.
- `composer verify`: ESLint, Prettier, TypeScript, Pint, Larastan nivel 7, 105 pruebas
  con 853 aserciones y build Vite aprobados el 2026-08-14.
- Pendiente manual, sin declaración de cierre: fidelidad visual `PV-07`, teclado/lector,
  claro/oscuro/360 px y prueba de almacenamiento compatible con S3.
