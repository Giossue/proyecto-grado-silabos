# Documentos y operación

## Trazabilidad

- RF-066 a RF-075; CU-15 a CU-18.
- RN-031 a RN-034.
- RNF-006, RNF-008, RNF-013, RNF-017, RNF-024 a RNF-028 y RNF-034.
- DOC-10, COR-12 y ADM-08 a ADM-10.
- PV-07, PV-09, PV-11 y PV-15.

## Comportamiento

- DOCX y PDF nacen de la misma revisión y plantilla.
- Cada artefacto identifica expediente, revisión, plantilla, tiempo y huella.
- La descarga reautoriza y no expone almacenamiento público.
- Informes definen indicador y respetan filtros/alcance.
- Auditoría apend-only reconstruye transiciones y acciones críticas.
- Trabajos asíncronos muestran estado, intentos y causa sin duplicar efectos.
- Importaciones son trazables, conciliables y de solo lectura sobre la fuente.

## Criterios críticos

- Una revisión no autorizada no puede exportarse ni descargarse.
- Un reintento genera un resultado coherente sin alterar aprobación.
- DOCX y PDF no omiten campos obligatorios y se vinculan a igual revisión.
- Un reporte agregado no filtra datos fuera del alcance del actor.
- El administrador puede diagnosticar un trabajo sin ver secretos ni contenido sensible.

## Estado de implementación I-05

- `DocumentRenderer` desacopla el flujo del motor y `baseline-ooxml-pdf-v1` demuestra el
  contrato con DOCX/PDF estructuralmente válidos y deterministas. Es un formato técnico
  provisional: no sustituye el DOCX oficial ni cierra `PV-07`.
- Solicitud, ejecución y publicación son idempotentes; ambos objetos privados conservan
  revisión, plantilla, renderer, locale, fecha, tamaño y huella. Cada descarga vuelve a
  autorizar por registro.
- Los eventos de envío, reenvío, corrección, aprobación y reapertura insertan un outbox
  dentro de la transacción. El consumidor entrega una sola notificación interna. No se
  activa correo mientras `PV-15` continúe abierto.
- COR-12 define sus indicadores en pantalla y aplica el alcance de carrera a agregados y
  detalle. No codifica metas institucionales.
- ADM-09 expone estado, progreso, conteo acumulado y causa segura; el reintento conserva
  la evidencia anterior en auditoría. ADM-10 no entrega payloads, rutas, contenido ni
  UUID de recursos en la interfaz.
- No existe borrado ni purga hasta resolver `PV-11` y `PV-12`.

## Estado de implementación I-07

- ADM-08 permite al administrador ejecutar y consultar una simulación asíncrona con un
  fixture sintético versionado. La solicitud y el trabajo son idempotentes y observables
  en ADM-09 y UI-03.
- Cada fila conserva payload privado, normalización y huellas; la interfaz solo muestra
  valores académicos normalizados, clasificación, motivo y métricas.
- El reconciliador señala posibles altas, cambios o coincidencias, pero toda fila válida
  queda en conflicto porque `PV-10` no confirma aún la identidad institucional.
- Excluir una fila exige justificación y crea una decisión humana auditada e inmutable.
  No existe botón, endpoint, caso de uso ni contrato implementado para aplicar cambios.
- `anonymized-fixture-v1` no contiene personas ni realiza I/O. Conector real, esquema,
  credenciales, red, reglas de enlace, tratamiento/retención y aplicación siguen
  bloqueados por `PV-09`, `PV-10` y `PV-12`.
