# I-06: Asistencia de IA explicable

## Estado

Implementado y verificado automáticamente el 2026-08-14. La evaluación institucional,
de accesibilidad y del modelo/corpus permanece abierta para I-08.

## Trazabilidad

- RF-046 a RF-054; RN-015, RN-016 y RN-028 a RN-030; CU-08.
- RNF-013, RNF-016, RNF-017, RNF-035 y RNF-036.
- DOC-06; IA-NEG-01 a IA-NEG-09.
- ADR-0003; PV-02, PV-13, PV-14 y PV-18.

## Resultado demostrable

Un docente solicita análisis de un campo habilitado. Laravel fija entrada y evidencia
vigente, registra un job idempotente y llama un `AiAnalysisGateway`. La recomendación
estructurada muestra explicación, fuente, versión y fragmento. Ignorar, aceptar, marcar
no útil o aplicar son decisiones humanas auditadas. Caída, timeout, conflicto o evidencia
insuficiente dejan un estado seguro y no alteran ni bloquean el sílabo.

## Decisiones y puertas

- `PV-13` y `PV-14` impiden seleccionar hardware/modelo final. Se implementa el puerto,
  un cliente HTTP limitado a loopback, un gateway deshabilitado y un simulador técnico
  determinista `contract-simulator-v1` para contrato/pruebas. La UI no lo presenta como
  modelo validado ni resultado institucional.
- `PV-18` impide fijar umbrales de utilidad o precisión. El contrato no expone una
  probabilidad ni usa score para bloquear, aceptar o aplicar.
- `PV-02` impide elegir precedencia entre fuentes. La recuperación incluye todas las
  versiones activas vinculadas; valores exactos divergentes producen `inconclusive` y
  se muestran para resolución humana, sin ranking silencioso.
- Una fuente se filtra por carrera, vínculo a convocatoria, estado, vigencia y activación en el
  instante de solicitud. El job usa el snapshot inmutable de esa evidencia.
- El contenido y los fragmentos son datos delimitados. El gateway no recibe herramientas,
  red libre ni archivos; el cliente HTTP rechaza hosts no locales.

## CU-08 — Analizar contenido

- Actor/rol: Docente colaborador vigente sobre borrador editable.
- Disparador: solicita ayuda en campo textual con `ia_habilitada`.
- Precondición: campo y plantilla coinciden; contenido máximo 50 000 caracteres; fuentes
  activas de la convocatoria se fijan sin conflicto no resuelto.
- Efecto persistente: ejecución, huellas, versiones, evidencia, salida y feedback.
- Aplicación: comprueba huella y `lock_version`, muestra vista previa y usa la misma
  mutación de borrador; nunca cambia estado ni aprueba.
- Alternativas: evidencia insuficiente/conflictiva → no concluyente; gateway caído o
  contrato inválido → fallido seguro; el flujo determinístico continúa.

## Pasos

- [x] Crear esquema y constraints de ejecuciones, evidencia, recomendaciones y feedback.
- [x] Implementar gateways, contrato validado y recuperación autorizada.
- [x] Implementar solicitud/job idempotente, estados y degradación segura.
- [x] Implementar feedback y aplicación humana con concurrencia optimista.
- [x] Construir DOC-06 e integración en el editor.
- [x] Cubrir IA-NEG-01 a IA-NEG-09 y regresión del flujo sin IA.
- [x] Actualizar trazabilidad y ejecutar `composer verify`.
- [x] Dejar evaluación experta/modelo/hardware/umbrales para I-08 y PV correspondientes.
- [ ] Validar manualmente teclado, lector, claro/oscuro/360 px y evaluar modelo/corpus con
  docentes expertos en I-08.

## Riesgos y reversión

- El gateway se cambia por configuración/DI; las ejecuciones conservan versión solicitada
  y ejecutada, por lo que un cambio no recalcula histórico.
- Desactivar IA solo impide nuevas ayudas; no toca campos, revisiones ni aprobaciones.
- Un resultado inválido se rechaza completo antes de persistir recomendaciones.
- No se registra prompt completo, secreto, texto del sílabo ni fragmentos en logs o errores;
  el contenido reproducible permanece únicamente en tablas funcionales privadas.

## Evidencia de cierre

- Migración `2026_08_14_000008_create_ai_assistance_tables.php` con relaciones, estados,
  unicidad funcional, cierre temporal e inmutabilidad probados en PostgreSQL 18.
- `AiAnalysisGateway` desacopla `disabled`, `contract-simulator-v1` y HTTP loopback; el
  contrato rechaza referencias inventadas, salidas fuera de límite y acciones académicas.
- `AiAssistanceTest`: 9 casos y 116 aserciones para CU-08, IA-NEG-01..09, alcance,
  idempotencia, rate limit y constraints de historial.
- `composer verify`: ESLint, Prettier, TypeScript, Pint, Larastan nivel 7, 114 pruebas con
  969 aserciones y build Vite aprobados el 2026-08-14.
- Con `AI_DRIVER=disabled`, `CampaignAndDraftTest` y `ReviewWorkflowTest`: 19 pruebas y
  353 aserciones aprobadas; el flujo humano no depende del servicio de IA.
- Pendiente manual, sin declaración de cierre institucional: accesibilidad/viewport,
  evaluación experta, hardware/modelo/corpus y umbrales de PV-02/PV-13/PV-14/PV-18.
