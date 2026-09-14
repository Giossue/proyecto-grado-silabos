# I-73 — Proveedores de IA configurables

## Estado

Implementación terminada el 14 de septiembre de 2026 por decisión explícita del
responsable del producto. La puerta completa quedó pendiente únicamente de repetir la
prueba de infraestructura con Redis disponible en `127.0.0.1:56379`.

## Trazabilidad

- RF-046..054; CU-08; DOC-06.
- RN-015, RN-016 y RN-028..030.
- RNF-013, RNF-016, RNF-017, RNF-035 y RNF-036.
- PV-02, PV-13, PV-14 y PV-18 permanecen abiertas para la evaluación académica y el
  modelo definitivo. El soporte técnico de proveedores no convierte su salida en una
  decisión académica.

## Decisión confirmada

El despliegue puede seleccionar OpenAI, Claude o DeepSeek mediante `AI_DRIVER`. Los tres
adaptadores comparten únicamente `AI_BASE_URL`, `AI_MODEL` y `AI_API_KEY`; no se exponen
parámetros de razonamiento. `disabled` sigue siendo el valor seguro por defecto y los
adaptadores `baseline` y `http` se conservan para pruebas y compatibilidad local.

La clave vive exclusivamente en el gestor de secretos/variables del despliegue. Laravel
envía al proveedor el campo analizado y la fotografía de evidencia autorizada, valida la
salida con el contrato existente y nunca persiste ni registra la clave, el prompt completo
o razonamiento interno.

## Unidad vertical

- [x] Adaptadores HTTP para Responses de OpenAI, Messages de Claude y Chat Completions
      de DeepSeek.
- [x] Configuración común, URL HTTPS sin redirecciones, timeouts y errores seguros.
- [x] JSON estructurado normalizado al contrato `ai-analysis-v1`; pensamiento de
      DeepSeek deshabilitado explícitamente.
- [x] Pruebas de protocolo, resolución del driver, validación y no filtración de secretos.
- [x] Variables y procedimiento de Dokploy, arquitectura, amenazas y trazabilidad.
- [ ] Verificación completa del repositorio: lint, formato, TypeScript, PHPStan, 425 de
      426 pruebas y build pasaron; `RedisConnectionTest` no pudo abrir el puerto local
      porque este entorno no dispone de Redis ni Docker.

## Riesgo operativo

Activar un proveedor alojado transfiere al tercero el texto del campo y los extractos de
fuentes seleccionadas. Antes de habilitarlo en producción deben acordarse proveedor,
modelo, región, retención y tratamiento institucional de datos. La indisponibilidad o
respuesta inválida solo degrada la asistencia de IA.
