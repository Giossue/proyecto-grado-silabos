# I-07: Importación institucional reversible

## Estado

Implementado y verificado automáticamente el 2026-08-14. El conector, aplicación,
identidad y tratamiento institucionales permanecen bloqueados por PV-09, PV-10 y PV-12.

## Trazabilidad

- RF-016 y RF-075; CU-18.
- RNF-006, RNF-008, RNF-013, RNF-017, RNF-024, RNF-027 y RNF-034.
- ADM-08; CP funcionales de importación, idempotencia, alcance y conflicto.
- PV-09, PV-10 y PV-12.

## Resultado demostrable

Un administrador ejecuta en cola una simulación desde un fixture sintético versionado.
El sistema fija cada fila y huella, valida, propone alta/cambio/sin cambio y convierte toda
coincidencia en conflicto humano porque la identidad institucional no está confirmada.
Repetir la petición no duplica la ejecución. Excluir un conflicto queda auditado e
inmutable. Ningún paso escribe en una fuente externa ni modifica catálogos académicos.

## Decisiones y puertas

- `PV-09` bloquea esquema, credenciales, red y adaptador productivo. Se implementan
  `InstitutionalDataReader` y `anonymized-fixture-v1`; el único perfil contiene datos
  sintéticos en código y no realiza I/O externo.
- `PV-10` bloquea asumir que códigos o nombres son claves únicas institucionales. El
  reconciliador puede señalar candidatos exactos y proponer impacto, pero clasifica la
  fila como conflicto `identity_rule_unconfirmed`; nunca enlaza, crea ni actualiza.
- `PV-12` mantiene pendiente tratamiento/retención productivos. El fixture no contiene
  personas; staging e historial no implementan borrado hasta que exista política.
- La decisión humana disponible es `exclude`: retira la fila de una aplicación futura,
  con justificación. No se ofrece `link`, `merge` ni `apply` mientras las puertas sigan
  abiertas.

## CU-18 — Simular sincronización

- Actor: Administrador con rol administrador activo.
- Entrada: perfil allowlist, versión de lector fijada y clave de idempotencia.
- Efecto: ejecución y job observables; lote limitado; raw/normalizado privados; propuesta,
  conflicto, métricas, notificación y auditoría.
- Alternativas: fila inválida → rechazada; referencia duplicada o identidad no confirmada
  → conflicto; lector/contrato caído → fallo seguro; ningún catálogo cambia.
- Repetición: igual clave devuelve la misma ejecución; un job terminal no reprocesa.

## Pasos

- [x] Crear esquema y constraints de ejecución, items y conflictos.
- [x] Implementar contratos, fixture, mapper y reconciliador conservador.
- [x] Implementar solicitud/job idempotente, límites, observabilidad y fallo seguro.
- [x] Construir ADM-08 y resolución `exclude` auditada.
- [x] Probar autorización, contrato hostil, duplicados, propuestas y cero mutación académica.
- [x] Actualizar documentación/trazabilidad y ejecutar `composer verify`.
- [x] Mantener conector, credenciales, aplicación y reglas de identidad bloqueados por PV.

## Riesgos y reversión

- El lector se sustituye por DI sin cambiar el reconciliador. Una versión distinta no
  procesa una solicitud ya fijada.
- Todo el lote se clasifica en memoria y se persiste en una sola transacción, evitando
  staging parcial. Reintentos antes de completar no duplican items.
- Redis es descartable; estado, intentos e input fijado viven en PostgreSQL.
- El raw del fixture es privado y nunca aparece en auditoría, logs ni UI.

## Evidencia de cierre

- Migración `2026_08_14_000009_create_institutional_import_tables.php` con staging,
  estados terminales y conflictos protegidos por constraints/triggers PostgreSQL.
- `InstitutionalImportTest`: 9 pruebas y 117 aserciones focalizadas sobre autorización,
  rate limit, idempotencia, contrato, fallo seguro, exclusión e inmutabilidad.
- `anonymized-fixture-v1` contiene cinco filas sintéticas; el lector desactivado falla de
  forma segura y ningún camino escribe tablas académicas.
- ADM-08 muestra solo el resultado normalizado necesario, sin raw, referencias externas,
  UUID internos ni detalles de proveedor.
- La puerta global de I-08 cubre nuevamente este módulo. Las pruebas de origen real se
  mantienen fuera de alcance hasta una decisión y un ambiente autorizado.
