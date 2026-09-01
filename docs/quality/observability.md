# Observabilidad y auditoría

## Diferencia

- **Observabilidad técnica:** diagnostica salud, latencia, errores y capacidad; tiene
  retención operativa.
- **Auditoría funcional:** prueba quién hizo qué sobre qué expediente y resultado; es
  apend-only para usuarios funcionales.

No uses logs generales como sustituto de auditoría.

## Logs estructurados

Campos mínimos:

- timestamp UTC;
- nivel, ambiente y versión;
- `correlacion_id`, request/job ID;
- usuario interno, rol y alcance cuando sea lícito;
- módulo, operación y resultado;
- tipo de excepción seguro y duración.

No registrar contraseña, token, cookie, `.env`, documento completo, prompt completo,
fragmentos sensibles o stack trace en respuestas públicas.

## Métricas

- latencia y tasa de error HTTP por ruta/clase;
- consultas lentas y conexiones;
- profundidad/espera/fallos/reintentos de colas;
- duración y resultado de exportación e IA;
- disponibilidad de dependencias;
- eventos funcionales agregados sin datos personales innecesarios.

## Eventos de auditoría mínimos

Inicio/cierre/revocación sensible, cambios de rol, publicación de plantilla, activación o
resolución de fuente, apertura de convocatoria, envío/reenviado, observación/corrección,
aprobación, reapertura y descarga/exportación sensible.

Registra actor, rol y alcance, acción, tipo/ID de recurso, revisión/versión, fecha, resultado,
motivo cuando aplique y correlación. Evita duplicar contenido completo; usa diferencias o
huellas proporcionalmente.

## Alertas

Alertar por síntomas accionables con runbook: error sostenido, cola estancada, backup
fallido, almacenamiento casi lleno, dependencia crítica caída, p95 fuera de presupuesto o
eventos de seguridad. Evita alertas por cada fallo aislado recuperable.

Los supervisores deben observar separadamente `critica`, `notificaciones`, `documentos`,
`ia` e `integraciones`; escuchar solo `general` deja trabajo funcional sin consumir. Estado,
intentos y diagnóstico permanecen en PostgreSQL y se consultan en ADM-09.
