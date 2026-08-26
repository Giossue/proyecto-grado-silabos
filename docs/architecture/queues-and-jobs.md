# Colas y trabajos

## Usos

- análisis de IA;
- generación DOCX/PDF;
- importaciones y reconciliación;
- notificaciones externas;
- tareas de mantenimiento y reportes pesados.

Guardar, validar determinísticamente, enviar, observar, aprobar y reabrir mantienen su
verdad en la transacción web; los efectos secundarios se ejecutan después.

## Reglas de un job

Cada trabajo define:

- identificador y tipo;
- recurso/versión de entrada;
- clave de idempotencia;
- cola y prioridad;
- tiempo máximo;
- máximo de intentos y backoff;
- condiciones de reintento/no reintento;
- estado y progreso persistidos en PostgreSQL;
- `correlation_id` y métricas;
- resultado o causa segura de fallo.

El payload contiene IDs y versiones, no objetos enormes ni secretos.

## Consistencia

- Despacha después del commit (`after_commit` o equivalente explícito).
- Para efectos que no se pueden perder, inserta outbox dentro de la misma transacción.
- El consumidor marca la entrega de forma idempotente.
- Reintentar no crea otra revisión, aprobación, notificación o artefacto lógico.
- PostgreSQL conserva el estado funcional; Redis puede vaciarse/reconstruirse.

## Colas sugeridas

`critical`, `documents`, `integrations`, `ai` y `notifications`. La prioridad y cantidad
de workers se miden; no se supone capacidad antes de `PV-05` y `PV-13`.

## Operación

Horizon puede supervisar Redis. La pantalla ADM-09 muestra estado de negocio sin exponer
payload sensible. Alertas mínimas:

- crecimiento sostenido de espera;
- fallos definitivos;
- trabajos atascados;
- tasa de reintentos;
- latencia por tipo;
- servicio dependiente no disponible.

Reprocesar desde interfaz requiere permiso, confirma impacto y conserva todos los intentos.

## Trabajo `ai.analysis`

I-06 registra el recurso funcional antes de despachar `AnalyzeSyllabusFieldJob` a la cola
`ai`. El payload contiene solo el UUID de la ejecución. Entrada, evidencia, parámetros,
estado e intentos viven en PostgreSQL. El job es idempotente frente a estados terminales,
tiene tres intentos, timeout de 60 segundos y backoff 5/30/120.

Los errores de contrato no se reintentan: terminan con `ai_contract_invalid`. Una caída o
timeout del gateway usa los reintentos del worker y, al agotarlos, guarda
`ai_service_unavailable` sin copiar el mensaje técnico. Conflicto, evidencia vacía o
exceso de fragmentos son resultados no concluyentes, no fallos de la cola.

## Trabajo `import.simulation`

I-07 registra `ImportExecution` y `JobExecution` antes de despachar
`SimulateInstitutionalImportJob` a `integrations`. El payload de cola contiene solo el
UUID de la ejecución; el input fijado, huellas, clasificación, métricas e intentos viven
en PostgreSQL. Tiene tres intentos, timeout de 120 segundos y backoff 5/30/120.

El lote completo se valida antes del staging y se inserta en una sola transacción. Un
contrato inválido termina como `import_contract_invalid`; indisponibilidad agota los
reintentos y persiste `institutional_reader_unavailable`. Ambos mensajes son seguros y
declaran que ningún catálogo cambió. Reprocesar una ejecución terminal no agrega filas.
