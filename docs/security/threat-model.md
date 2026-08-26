# Modelo de amenazas

## Activos

- credenciales, sesiones y asignaciones de rol;
- datos personales de usuarios;
- estructura y fuentes académicas;
- borradores, revisiones, observaciones y aprobaciones;
- plantillas oficiales, DOCX/PDF y huellas;
- auditoría y evidencias de IA;
- secretos de base, almacenamiento, correo e integraciones;
- disponibilidad del proceso durante plazos académicos.

## Fronteras

1. navegador ↔ Laravel;
2. Laravel ↔ PostgreSQL;
3. Laravel/worker ↔ Redis;
4. aplicación ↔ almacenamiento privado;
5. worker ↔ servicio local de IA;
6. importador ↔ fuente institucional;
7. operadores ↔ despliegue/backups.

## Amenazas prioritarias

| Amenaza | Escenario | Controles principales |
|---|---|---|
| Acceso horizontal | Docente cambia UUID/URL y ve otro sílabo | Policy por registro, scope SQL, pruebas de fuga |
| Elevación de rol | El frontend concede capacidad | permiso servidor, vigencia, auditoría |
| CSRF/session fixation | Mutación con sesión robada/fijada | Fortify, CSRF, cookies seguras, rotación, revocación |
| XSS/Markdown | Fuente o sílabo ejecuta script | escape, sanitización allowlist, CSP evaluada |
| Inyección | filtros/importación alteran consulta | Query Builder, allowlists, validación |
| Mass assignment | petición cambia estado/rol no permitido | DTO/validated, fillable estricto, casos de uso |
| Upload malicioso | DOCX/archivo activo o enorme | tipo real, límites, privado, cuarentena/escaneo |
| URL de descarga filtrada | enlace entrega documento después | expiración corta y reautorización |
| Revisión manipulada | aprobado se sobrescribe | append-only, constraints, huella, auditoría |
| Carrera/reintento | dos envíos/aprobaciones | lock/versión, idempotencia, transacción |
| Job replay | trabajo duplica efectos | clave única, estado persistido, outbox |
| Prompt injection | fuente ordena exfiltrar/ignorar reglas | datos delimitados, sin tools/red, simulador independiente del contenido y salida validada |
| Referencia inventada | IA cita fuente inexistente | snapshot de IDs autorizados, contrato y vínculo PostgreSQL |
| SSRF/proveedor externo | URL de IA sale del host autorizado | cliente solo HTTP loopback, sin credenciales ni redirecciones |
| Decisión encubierta de IA | respuesta intenta aprobar, calificar o cambiar estado | claves prohibidas, tipos allowlist y aplicación humana separada |
| Exfiltración por logs | prompts/documentos aparecen en logs | minimización, redacción, acceso/retención |
| Importación corrupta | claves fusionan personas/asignaturas | fixture aislado, contrato estricto, staging atómico, simulación, conflicto humano, sin aplicador |
| Ransomware/pérdida | base/archivos destruidos | backups aislados, restore probado, mínimo privilegio |
| DoS | IA/exportación/importación agota workers | colas separadas, rate limit por actor/recurso, límites de entrada y timeout |

## Casos de abuso obligatorios

- usuario inactivo mantiene una pestaña abierta;
- coordinador accede a otra carrera;
- docente manipula estado o `revision_id`;
- descarga con enlace vencido/sesión revocada;
- fuente contiene HTML/script e instrucciones hostiles;
- archivo con extensión permitida y contenido distinto;
- misma petición se envía en paralelo;
- worker procesa después de que cambió la versión esperada;
- importación repite lote o cambia clave externa;
- auditor intenta modificar evento desde interfaz/API.

Actualiza este documento al agregar una frontera o dato sensible.
