# Hardening por frontera

## Identidad y sesión

- Usa Fortify/starter; no implementes hash, reset o 2FA manualmente.
- Desactiva registro público hasta autorización.
- Cookies `Secure`, `HttpOnly`, `SameSite`; CSRF y rotación al autenticar.
- Rate limit en login, recuperación y acciones sensibles.
- Revocación de sesiones y desactivación efectiva en la siguiente petición.
- Cuentas gestionadas no se autoeliminan; la baja administrativa conserva referencias
  históricas protegidas por claves foráneas restrictivas.
- Mensajes de recuperación no confirman existencia de cuenta.

## Autorización

- Policies/Gates + filtros de consulta.
- No confíes en rol enviado por el cliente o almacenado sin validación.
- IDs no secuenciales ayudan contra enumeración, pero no sustituyen permiso.
- Exportaciones, reportes, conteos y auditoría aplican el mismo alcance.

## Entrada, salida y formularios

- Form Requests, límites de tamaño/profundidad y allowlists.
- Salida escapada; Markdown con sanitizador probado.
- Orden/filtros solo en columnas declaradas.
- Protección contra overposting; estados se cambian por acciones específicas.
- Errores públicos sin SQL, rutas, stack o secretos.

## Base de datos

- Usuario de runtime sin permisos DDL; migrador separado cuando sea posible.
- TLS/red restringida según infraestructura.
- Constraints para invariantes y queries parametrizadas.
- Backups cifrados, acceso auditado y restauración probada tras PV-11.

## Redis y jobs

- Redis no expuesto públicamente; autenticación/red privada.
- Payload mínimo, sin secretos/documentos completos.
- Timeout, intentos, backoff, idempotencia y separación de colas.
- Dashboard Horizon protegido por autorización administrativa.

## Archivos

- Disco privado, nombres generados, MIME real, tamaño y huella.
- URLs temporales cortas y reautorización.
- Plantillas/fuentes no se ejecutan como código.
- Conversión documental aislada con recursos limitados si el motor lo permite.

## IA

- Servicio en red privada y autenticación entre servicios.
- Modelos sin salida a Internet salvo autorización explícita.
- Fuentes delimitadas como datos; sin herramientas peligrosas.
- Esquema de salida estricto y referencias verificadas.
- Límites de tokens/tamaño/tiempo/concurrencia.
- Redacción/minimización de prompts y logs.

## Integración institucional

- Credencial de solo lectura y mínimo privilegio.
- Staging/dry-run, validación y conflictos antes de aplicar.
- No almacenar credenciales o dumps en artefactos/CI.
- Registrar origen, lote, huellas y resultado.

## Cabeceras y transporte

- HTTPS y redirección segura en ambientes expuestos.
- HSTS cuando el dominio/operación lo permitan.
- CSP, `frame-ancestors`, `nosniff`, referrer policy y permisos evaluados/probados.
- CORS cerrado; Inertia normalmente comparte origen.

## Verificación de release

- dependencias/auditoría de paquetes;
- secretos y configuración;
- pruebas de autorización/abuso;
- uploads y descargas;
- políticas de logs;
- backup/restauración;
- escaneo dinámico/manual proporcional;
- revisión de cambios de migración e infraestructura.

La puerta local ejecuta `composer security:scan`, y la CI audita ambos lockfiles en cada
cambio y semanalmente. El scanner informa solo archivos afectados, excluye dependencias y
artefactos generados y rechaza claves privadas, patrones de credenciales y dumps no
autorizados. No sustituye secret scanning del proveedor, DAST ni revisión humana.

`AddSecurityHeaders` aplica `nosniff`, denegación de frames, CSP restrictiva para
`frame-ancestors`, `base-uri`, `form-action` y `object-src`, políticas de referencia,
permisos y recursos cross-origin. HSTS se emite solo bajo HTTPS en producción. Readiness
no inicia sesión ni emite cookies.
