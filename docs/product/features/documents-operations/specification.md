# Documentos y operación

## Trazabilidad

- RF-066 a RF-074; CU-15 a CU-17.
- RN-031 a RN-034.
- RNF-006, RNF-008, RNF-013, RNF-017, RNF-024 a RNF-028 y RNF-034.
- DOC-10, COR-12, ADM-09 y ADM-10.
- PV-07, PV-11 y PV-15.

## Comportamiento

- DOCX y PDF nacen de la misma revisión y plantilla.
- Cada artefacto identifica expediente, revisión, plantilla, tiempo y huella.
- La descarga reautoriza y no expone almacenamiento público.
- Informes definen indicador y respetan filtros/alcance.
- Auditoría apend-only reconstruye transiciones y acciones críticas.
- ADM-09 muestra estado, intentos y causa de cada proceso, sin duplicar efectos. Se
  titula «Procesos»: nombra para qué sirve, no la máquina que hay debajo.
- La navegación administrativa agrupa ADM-09 como «Procesos» y ADM-10 como «Registro de
  actividad» dentro del submenú «Auditoría»; sus responsabilidades y datos permanecen
  separados.

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
