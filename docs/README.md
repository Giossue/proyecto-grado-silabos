# Índice de conocimiento

## Producto

- `product/overview.md`: problema, alcance y resultados.
- `product/domain-model.md`: agregados, entidades e invariantes.
- `product/syllabus-lifecycle.md`: estados y transiciones.
- `product/roles-and-permissions.md`: actores, alcance y autorización.
- `product/use-cases.md`: CU-01 a CU-18 y requisitos relacionados.
- `product/screens.md`: UI-01 a UI-04, DOC-01 a DOC-10, COR-01 a COR-12 y
  ADM-01 a ADM-11.
- `product/syllabus-sections.md`: contenido funcional de las doce secciones.
- `product/requirements-map.md`: mapa de RF, RNF, reglas, interfaces y pruebas.
- `product/glossary.md`: lenguaje ubicuo.
- `product/features/`: especificaciones por capacidad.

## Arquitectura

- `architecture/index.md`: rutas de lectura por tipo de tarea.
- `architecture/stack.md`: línea base tecnológica y comandos.
- `architecture/modules.md`: límites del monolito modular.
- `architecture/backend.md`, `frontend.md`, `database.md`.
- `architecture/sequences.md`: interacciones canónicas de los flujos críticos.
- `architecture/queues-and-jobs.md`, `files-and-documents.md`.
- `architecture/ai-service.md`, `integrations.md`, `deployment.md`.
- `architecture/adr/`: decisiones duraderas.

## Ejecución

- `plans/programming-plan.md`: qué significa el plan de programación.
- `plans/increments.md`: orden de construcción.
- `plans/decisions-pending.md`: puertas P0/P1/P2 y entrevistas.
- `plans/active/`: trabajo en curso.
- `plans/completed/`: historial de planes finalizados.

## Calidad y seguridad

- `quality/definition-of-done.md`, `testing.md`, `traceability.md`,
  `code-review.md`, `frontend-checklist.md`, `observability.md` y
  `version-control.md`.
- `quality/acceptance-status.md`: evidencia técnica, casos manuales y puertas PV sin
  atribuir resultados inexistentes.
- `security/principles.md`, `threat-model.md` y `hardening.md`.
- `references/baseline.md`: procedencia y actualización de la línea base.
- `references/entrevista-decisiones-abiertas.md`: guion de consulta sobre titularidad del
  sílabo, relevo docente, plazos y coordinación encargada, con la evidencia del respaldo
  institucional que lo sustenta.
- `references/entrevista-2026-08-26-hallazgos.md`: respuestas de esa consulta, su alcance
  y el impacto de cada una sobre el sistema.
- `references/normativa-silabo.md`: normas escritas que sustentan el sílabo, con cita
  textual, fecha y estado de vigencia.

## Operación

- `runbooks/demo.md`: recorrido reproducible de CU-01 a CU-18 con los tres roles.
- `runbooks/release-verification.md`: puerta, audits, salud, colas, restore y baseline.
- `runbooks/deploy-dokploy.md`: despliegue de la imagen en Dokploy contra el PostgreSQL
  y el Redis existentes del servidor.

## Regla de mantenimiento

Un documento derivado nunca debe contradecir silenciosamente a la SRS o a una decisión
confirmada. Si cambia el producto, actualiza primero la fuente de verdad y después las
referencias dependientes.
