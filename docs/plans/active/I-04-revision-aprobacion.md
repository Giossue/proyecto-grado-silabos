# I-04: Revisión, corrección, aprobación y reapertura

## Estado

Implementado y verificado automáticamente. El cierre depende de la revisión manual de
interfaz, de la prueba con usuarios `DT-07` y de `PV-16`; ver
`docs/plans/pending-work.md`. `composer verify` en verde el 2026-08-21: 163 pruebas y 1887 aserciones.

## Trazabilidad

- RF-045 y RF-055 a RF-065; RN-019 y RN-025 a RN-027; CU-09 a CU-14.
- DOC-07 a DOC-09; COR-05 a COR-10.
- ADR-0002, ADR-0005, PV-16 y DT-07.

## Resultado demostrable

El docente valida y envía un snapshot inmutable e idempotente. Coordinación revisa ese
snapshot exacto, registra observaciones, solicita corrección, verifica respuestas y
compara revisiones antes de aprobar. Reabrir conserva aprobación y revisión, crea una
línea editable vinculada y exige causa.

## Decisiones y supuestos

- ADR-0002 fija revisiones append-only y aprobaciones sobre una revisión concreta.
- ADR-0005 adopta provisionalmente `correction_requested` tras reapertura; DT-07 sigue
  sujeto a prueba de usuarios y puede cambiar sin mutar historia.
- PV-16 continúa abierta: Coordinación no puede editar valores ni filas del docente.
- Envío, aprobación y reapertura exigen una clave UUID de idempotencia por expediente.
- Las notificaciones/outbox se conectarán en I-05; I-04 deja auditoría transaccional y
  contratos de eventos preparados sin fingir correo institucional.

## Casos de uso

### CU-09 — Enviar o reenviar

- Actor: Docente colaborador vigente con rol Docente.
- Precondiciones: `draft` o `correction_requested`, `lock_version` vigente y validación
  determinística ejecutada sobre esa versión sin errores.
- Efecto: snapshot numerado, huella, transición a `in_review`, respuestas fijadas y
  auditoría; repetir la misma clave devuelve la misma revisión.

### CU-10/CU-11 — Observar, corregir y responder

- Actor de revisión: Coordinador en la carrera; actor de respuesta: Docente colaborador.
- Flujo: observaciones apuntan al snapshot; solicitar corrección selecciona al menos una;
  el borrador vuelve a habilitarse, el docente responde y reenvía otra revisión.
- Efecto: ninguna observación ni respuesta altera el snapshot observado.

### CU-12 — Comparar revisiones

- Actores: Coordinador de alcance o Docente autorizado.
- Efecto: diff por clave de campo e ID estable de fila entre dos snapshots del mismo
  expediente; una revisión ajena no se revela.

### CU-13 — Aprobar

- Actor: Coordinador de alcance.
- Precondiciones: revisión actual, estado `in_review` y observaciones previas verificadas.
- Efecto: aprobación append-only con huella, transición a `approved` y auditoría
  idempotente.

### CU-14 — Reabrir

- Actor: Coordinador de alcance.
- Precondiciones: expediente aprobado, aprobación vigente e indicación de causa.
- Efecto: registro append-only, restauración del snapshot aprobado como trabajo,
  transición a `correction_requested` y vínculo desde la próxima revisión.

## Pasos

- [x] Crear esquema, constraints y triggers append-only.
- [x] Implementar snapshots, validación, envío idempotente y transiciones.
- [x] Implementar observaciones, solicitud, respuestas y verificación.
- [x] Implementar comparación estructural de revisiones.
- [x] Implementar aprobación y reapertura idempotentes.
- [x] Construir DOC-07..09 y COR-05..10.
- [x] Mantener COR-06 como página completa y mover el alta de observaciones al `Sheet`
      derecho compartido.
- [x] Probar estados, alcance, concurrencia, idempotencia e inmutabilidad PostgreSQL.
- [x] Actualizar trazabilidad y ejecutar `composer verify`.
- [ ] Validar manualmente accesibilidad y probar DT-07 con usuarios en I-08.

## Riesgos y reversión

- Triggers protegen revisión, aprobación, reapertura y transición incluso fuera de Eloquent.
- Los snapshots no contienen secretos ni rutas; sí contenido académico mínimo requerido y
  por eso no se escriben en logs.
- Cambiar DT-07 solo afecta reaperturas futuras o estados de trabajo mediante migración;
  nunca reescribe evidencia histórica.
- Un fallo en validación o transición revierte la mutación completa.

## Evidencia de cierre

- La migración `000006` aplica relaciones consistentes, máquina de estados y triggers
  append-only también a escrituras que evadan Eloquent.
- `ReviewWorkflowTest` cubre validación y conflicto de envío, idempotencia, alcance por
  registro, corrección/respuesta, diff con IDs de fila estables, aprobación, reapertura,
  vínculos históricos y denegaciones de PostgreSQL: 8 pruebas y 254 aserciones.
- Las acciones críticas bloquean el agregado en un orden uniforme y auditan solo IDs,
  conteos, número de revisión y huellas; no escriben contenido académico en auditoría.
- DOC-07..09 y COR-05..10 reutilizan los componentes compartidos, no muestran UUID y
  explican antes de enviar, aprobar, solicitar corrección o reabrir.
- COR-06 conserva documento e historial como contenido principal y abre el alta de una
  observación desde `ReviewObservationSheet`.
- `composer verify`: 140 pruebas y 1374 aserciones; Pint, PHPStan nivel 7, ESLint,
  Prettier, TypeScript y build de producción aprobados. Solo se mantiene el aviso
  opcional de optimización de fuentes de Vite (`fontaine`).
- La verificación manual con teclado/lector, 360 px, claro/oscuro y la prueba de usuarios
  de DT-07 permanecen abiertas; no se declara aceptación institucional de ese estado.
