# Deuda técnica

Registra deuda concreta, no listas de deseos.

| ID | Hallazgo | Impacto | Evidencia | Acción | Prioridad | Dueño/fecha |
|---|---|---|---|---|---|---|
| DT-08 | Columnas internas de `sesiones`, `trabajos_fallidos`, `restablecimientos_contrasena` y `migraciones` siguen en inglés (`payload`, `last_activity`, `exception`, `token`, `migration`…) | Residuo inglés en 4 tablas de infraestructura del diagrama; invisible para el dominio | Drivers de Laravel las escriben con nombres fijos (`DatabaseSessionHandler`, `DatabaseUuidFailedJobProvider`, `DatabaseTokenRepository`, `DatabaseMigrationRepository`) | Aceptado en I-28; eliminarlas exigiría reimplementar drivers o cambiar de driver (p. ej. sesiones a Redis) | Baja | I-28 / 2026-09-01 |
| DT-09 | Claves internas de JSONB en inglés: `contexto_academico` (`schema_version`, `subject.*`, `curriculum.*`), `fotografia` de revisiones, `contenido` del outbox (`recipient_ids`…), `metadatos` de auditoría, `configuracion.content_type` de bloques | Vocabulario mixto dentro de documentos JSON; no aparece en el diagrama del esquema | Fotografías de revisiones aprobadas son evidencia sellada con huellas; reescribirlas mutaría historia | Si se decide traducir, hacerlo solo para documentos NUEVOS con `schema_version` 2 y lector dual; nunca reescribir sellados | Baja | I-28 / 2026-09-01 |
| DT-10 | El contrato HTTP del gateway de IA (`contract-simulator-v1`: claves y estados del payload) permanece en inglés | El vocabulario del servicio local difiere del persistido (se traduce al guardar) | `docs/architecture/ai-service.md`; motor/modelo reales dependen de PV-13/PV-14 | Decidir el idioma del contrato al cerrar PV-13/PV-14; hoy el simulador y el cliente son coherentes | Baja | I-28 / 2026-09-01 |

## Criterios

- Toda deuda describe el coste observable o riesgo.
- Un PV abierto no es deuda; vive en `decisions-pending.md`.
- Una mejora sin baseline no se etiqueta automáticamente como rendimiento.
- Una vulnerabilidad no espera aquí si requiere remediación urgente.
- Al resolver, conserva la fila con referencia al plan/commit.

