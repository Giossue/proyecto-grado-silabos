# Convocatoria y flujo del sílabo

## Trazabilidad

- RF-034 a RF-045 y RF-055 a RF-065.
- CU-06, CU-07 y CU-09 a CU-14.
- RN-017 a RN-027 y RN-033.
- DOC-01 a DOC-09; COR-01 a COR-10.
- PV-03, PV-04, PV-05, PV-06, PV-08 y PV-16.

## Comportamiento

- El coordinador prepara una convocatoria con periodo, plantilla, fuentes, asignaciones y plazos.
- Cada paralelo genera su propio sílabo y `por_paralelo` es la agrupación predeterminada;
  `por_oferta` se conserva como alternativa registrada conforme a DT-11.
- COR-02 prioriza el listado de convocatorias y abre su formulario de preparación desde una
  acción principal en un panel lateral derecho; conserva allí los errores hasta corregirlos.
- El sistema genera el conjunto esperado de sílabos sin duplicar el canónico.
- El docente edita por secciones, hereda datos maestros y ve completitud/errores.
- El autoguardado y el guardado explícito evitan pérdida y muestran su estado.
- La concurrencia no sobrescribe silenciosamente trabajo de otro colaborador.
- Enviar/reenviar ejecuta validaciones obligatorias y crea una revisión inmutable.
- El coordinador observa una revisión concreta, solicita corrección o aprueba.
- COR-06 mantiene la revisión como página completa, pero abre el alta de observaciones
  desde una acción principal en un panel lateral derecho.
- El docente responde; el coordinador verifica si la observación queda resuelta.
- La comparación muestra cambios de campos, filas y secciones.
- Reabrir conserva la revisión aprobada y registra causa/actor.

## Criterios críticos

- Una transición no permitida falla sin cambios parciales.
- Repetir una petición con la misma clave idempotente no crea dos revisiones.
- El porcentaje y los conteos de convocatoria coinciden con los expedientes filtrados.
- Un borrador no puede cambiar su versión de plantilla después de creado.
- Ningún rol puede editar una revisión enviada o aprobada.
