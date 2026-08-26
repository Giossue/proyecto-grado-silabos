# Servicio de asistencia de IA

## Frontera

Laravel conserva usuarios, permisos, convocatorias, contenido, fuentes, ejecuciones y
decisiones. Un servicio local realiza recuperación/inferencia detrás de un cliente HTTP.
El dominio depende de `AiAnalysisGateway`, no de un modelo o SDK.

```text
Docente → Laravel → registro EjecucionIA → cola Redis → Job
Job → AiAnalysisGateway → servicio local IA
                            │
                            └─ resultado + referencias
Job → valida contrato → persiste recomendaciones/evidencias → notifica
```

## Contrato lógico

La petición incluye solo lo necesario:

- `request_id` y versión del contrato;
- campo/sección y huella del contenido;
- contexto académico mínimo;
- IDs/versiones de fuentes autorizadas o fragmentos ya filtrados;
- versión de políticas/instrucciones;
- idioma y límites de salida.

La respuesta incluye:

- `request_id`, estado y modelo/versiones;
- recomendaciones estructuradas;
- referencias a fuente-versión-fragmento;
- advertencia de evidencia insuficiente;
- métricas técnicas permitidas;
- errores tipados, nunca una transición académica.

## Control humano

- La salida se presenta como recomendación.
- El texto del sílabo cambia solo después de acción explícita.
- Se conserva antes/después y decisión del usuario.
- Ningún umbral de confianza aprueba o bloquea.
- Conflictos de fuentes se muestran y escalan a una persona.

## Seguridad

- Fuentes y contenido son datos, no instrucciones ejecutables.
- Delimita y etiqueta fragmentos para reducir prompt injection.
- No habilites herramientas, red o archivos del host innecesarios al modelo.
- Limita tamaño, tiempo, concurrencia y salida.
- Valida el esquema de respuesta; rechaza referencias no solicitadas.
- Minimiza datos personales y no llama servicios externos no autorizados.
- Los logs usan huellas/IDs, no prompts completos por defecto.

## Reproducibilidad y caché

La clave funcional considera al menos contenido, campo, plantilla, reglas, conjunto de
fuentes/versiones, modelo y versión de instrucciones. Si uno cambia, no se reutiliza un
resultado incompatible. El histórico nunca se recalcula en silencio.

## Degradación

Timeout, modelo no disponible, respuesta inválida o evidencia insuficiente producen un
estado Fallido/No concluyente y una explicación segura. El usuario continúa con el flujo
determinístico. Usa circuit breaker/backoff solo después de medir; no encadenes reintentos
sin límite.

## Pendientes

`PV-13`, `PV-14` y `PV-18` impiden elegir hardware, modelos y umbrales finales. El
contrato y sus fakes sí pueden implementarse antes.

## Implementación reversible I-06

- Puerto: `AiAnalysisGateway`; adaptadores `disabled`, `baseline` y `http` seleccionados
  con `AI_DRIVER`. Producción parte en `disabled`.
- Contrato: `ai-analysis-v1`; instrucciones `ueb-editorial-v1`. La versión del gateway
  solicitada y la realmente ejecutada se conservan por separado.
- Red: el adaptador HTTP acepta únicamente `http` hacia `localhost`, `127.0.0.1` o `::1`,
  sin credenciales en URL ni redirecciones, con conexión y tiempo total acotados.
- Entrada: hasta 50 000 caracteres, 50 fragmentos y 12 000 caracteres por extracto. El
  snapshot privado conserva texto, huellas, fuente, versión y fragmento; logs y auditoría
  reciben solo IDs, versiones, conteos y huellas.
- Admisión: seis solicitudes nuevas por minuto y por docente/sílabo. La cuota es
  configurable y limita trabajo costoso sin afectar guardado, validación ni envío.
- Salida: hasta cinco recomendaciones normalizadas. `AiResultContract` verifica request,
  estados, tamaños, tipos, referencias, ausencia de HTML y ausencia de texto idéntico.
  El cliente HTTP rechaza además claves de decisión, nota, estado, score, herramientas o
  aprobación en cualquier nivel del JSON.
- Persistencia: `ejecuciones_ia`, `evidencias_ia`, `recomendaciones_ia`,
  `recomendacion_evidencias_ia` y `retroalimentacion_ia`. Triggers PostgreSQL fijan
  relaciones y cierran evidencia/salida al alcanzar un estado terminal.
- Cola: `ai`, tres intentos, timeout de 60 segundos y backoff 5/30/120. Un fallo conserva
  causa segura; evidencia insuficiente o conflictiva finaliza sin llamar al gateway.

El simulador `contract-simulator-v1` no usa el contenido de las fuentes como
instrucciones. Solo prueba integración, trazabilidad y control humano; debe reemplazarse
tras la evaluación de I-08 y las decisiones pendientes.
