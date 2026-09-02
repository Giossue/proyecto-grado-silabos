# I-28: Esquema de base de datos 100 % en español

## Estado

En curso — iniciado el 2026-09-01. (Renumerado de I-27 a I-28: el commit `829cd31` del
responsable asignó I-27 al plan de edición unificada de cuentas.)

Decisiones del responsable del producto (2026-09-01, consulta directa): esta sesión
implementa sobre `main` (la rama paralela `feat/esquema-espanol` queda descartada);
`email` → **`correo_electronico`** (columna y campo de formulario); las tablas muertas
de colas/caché se **eliminan**.

## Trazabilidad

Decisión de convención del responsable del producto (mismo carácter que I-12 e I-14):
todos los identificadores del esquema físico (nombres de tabla y de columna) quedan en
español. No altera comportamiento observable, autorización ni ciclo de vida, por lo que
no modifica filas de la matriz de trazabilidad; sí actualiza la convención documentada en
`docs/architecture/database.md`. No depende de una decisión `POR VALIDAR`.

Alcance de la regla: se traducen las palabras léxicas inglesas; las siglas técnicas
(`id`, `uuid`, `url`, `ip`, `json`) no cuentan como inglés. Los nombres de clases,
archivos y rutas de código siguen en inglés, como fija el precedente I-14 («las clases
siguen en inglés, las tablas y la interfaz en español»).

## Resultado demostrable

`\dt` y `\d` sobre la base muestran únicamente identificadores en español en todas las
tablas propias y en los nombres de las tablas de framework que sobreviven. La aplicación
completa (login, recuperación, sesiones, colas, admin de trabajos, fuentes, sílabos)
funciona igual que antes; `composer verify` en verde; la base local con datos migra en
caliente sin pérdida.

## Decisiones y supuestos

1. **Tablas de framework muertas se eliminan, no se renombran.** Producción y desarrollo
   usan `QUEUE_CONNECTION=redis` y `CACHE_STORE=redis` (deploy-dokploy.md y `.env`), por
   lo que `jobs`, `job_batches`, `cache` y `cache_locks` no tienen lector ni escritor.
   Se eliminan con `down()` que las recrea. Si un entorno futuro vuelve al driver
   `database`, deberá crear tablas nuevas (queda registrado en deuda técnica).
2. **Tablas de framework vivas se renombran por configuración soportada** (sin fork del
   framework): `sessions` → `sesiones` (`SESSION_TABLE`), `failed_jobs` →
   `trabajos_fallidos` (`queue.failed.table`), `password_reset_tokens` →
   `restablecimientos_contrasena` (`auth.passwords.users.table`), `migrations` →
   `migraciones` (`database.migrations.table`).
3. **Las columnas internas de esas tablas de framework vivas no se renombran**: Laravel
   las escribe con nombres fijos (`payload`, `last_activity`, `exception`, `token`…) y
   cambiarlas exigiría reemplazar los manejadores internos (sesiones, broker de
   contraseñas, proveedor de fallos). Se documenta como límite y queda en deuda técnica
   con las alternativas (driver Redis de sesiones o fork de manejadores).
4. **La tabla `migrations` no puede renombrarse dentro de una migración** (el migrador
   consulta su tabla de control antes de ejecutar). Se renombra con un comando artisan
   idempotente invocado por `docker/app/entrypoint.sh` antes de `migrate`, y manualmente
   una sola vez en entornos no contenedorizados.
5. **Timestamps de Eloquent**: `created_at`/`updated_at` pasan a `creado_en`/
   `actualizado_en` en todas las tablas propias. Un modelo base común declara las
   constantes `CREATED_AT`/`UPDATED_AT`; en Laravel 13 `latest()`/`oldest()` de Eloquent
   caen al valor del modelo, pero los usos sobre Query Builder puro se revisan uno a uno.
6. **`usuarios`** se renombra columna a columna con los puntos de extensión oficiales
   (`$rememberTokenName`, `getAuthPasswordName()`, overrides de `MustVerifyEmail`/
   `routeNotificationForMail`, accessors para el trait de 2FA de Fortify, claves
   `fortify.username`/`fortify.email`). El campo de formulario `password` y el checkbox
   `remember` conservan su nombre de petición HTTP porque Fortify los fija internamente;
   el esquema no los contiene.
7. **Funciones y triggers PL/pgSQL**: `ALTER TABLE … RENAME` no reescribe cuerpos de
   función (lección de I-14 con `validar_evidencia_ia`). Toda función/trigger que
   referencie una columna renombrada se redefine en la misma migración.
8. **Valores en inglés dentro de datos y `CHECK`s** (p. ej. estados `pending`/`active`,
   valores de `RoleCode`, discriminadores `resource_type`, claves internas de JSONB como
   `contexto_academico` o `payload`) son datos, no identificadores: quedan fuera de este
   incremento y se registran en deuda técnica como candidato a incremento propio.
9. Los nombres de archivo de migraciones (datos históricos de la tabla `migraciones`) no
   se reescriben: editar migraciones aplicadas está prohibido por convención.
10. **Grafía sin tilde = español.** El proyecto ya escribe `silabos`, `numero_revision`,
    `transiciones_silabo`; por tanto `decision`, `version`, `cache` no cuentan como
    inglés. Tampoco cuentan los latinismos y siglas: `campus`, `roles`, `id`, `uuid`,
    `mime`, `url`, `ip`.
11. **Colisión en tablas append-only**: `notificaciones_internas` y `eventos_auditoria`
    ya tienen una marca temporal de dominio en español (`creado_en`, `ocurrido_en`).
    Donde `creado_en` esté tomado, el `created_at` de Eloquent pasa a `registrado_en`
    (momento de inserción de la fila) con `CREATED_AT` por modelo; no se elimina ninguna
    columna con datos.
12. **Campos de petición HTTP**: `correo_electronico` y `nombre` sustituyen a
    `email`/`name` también como nombres de campo (lo exige la pareja
    `fortify.username`/`Rule::unique` para no desalinear campo↔columna). `password`,
    `current_password`, `password_confirmation`, `remember`, `token` y `code` se
    conservan como campos de petición porque Fortify los fija en su pipeline; no son
    parte del esquema.

## Mapa de renombrado

Esquema real verificado: 61 tablas — 53 de dominio (todas con nombre español salvo
`eventos_outbox`) y 8 de framework (todas inglesas). Sin SoftDeletes, sin morphs de
Eloquent, sin Sanctum/Horizon/Telescope; único enum PHP `RoleCode` (valores = datos).

### Tablas de framework

| Actual | Acción | Mecanismo |
|---|---|---|
| `cache`, `cache_locks` | **eliminar** (CACHE_STORE=redis en todos los entornos) | migración drop + down que recrea |
| `jobs`, `job_batches` | **eliminar** (QUEUE_CONNECTION=redis; no existe `Bus::batch`) | ídem |
| `sessions` | → `sesiones` | migración + `config/session.php` |
| `failed_jobs` | → `trabajos_fallidos` | migración + `config/queue.php` (literal, línea 126) |
| `password_reset_tokens` | → `restablecimientos_contrasena` | migración + `config/auth.php` |
| `migrations` | → `migraciones` | comando artisan idempotente + entrypoint + `config/database.php`; `scripts/verify-postgres-restore.sh:85` se actualiza |

Las columnas internas de `sesiones`, `trabajos_fallidos`, `restablecimientos_contrasena`
y `migraciones` las escribe Laravel con nombres fijos y quedan en inglés (deuda técnica
documentada). Índices y constraints de las tablas renombradas se renombran al prefijo
nuevo.

### `usuarios` (columna → nueva)

`name`→`nombre` · `email`→`correo_electronico` · `email_verified_at`→
`correo_verificado_en` (prefijo abreviado en derivados) ·
`password`→`contrasena` · `active`→`activo` · `deactivated_at`→`desactivado_en` ·
`remember_token`→`codigo_recordarme` · `must_change_password`→`debe_cambiar_contrasena` ·
`two_factor_secret`→`secreto_dos_factores` · `two_factor_recovery_codes`→
`codigos_recuperacion_dos_factores` · `two_factor_confirmed_at`→
`dos_factores_confirmado_en` · timestamps → `creado_en`/`actualizado_en`.

Soportes: `$authPasswordName`, `$rememberTokenName`, overrides de
`getEmailForPasswordReset/Verification`, `hasVerifiedEmail`/`markEmailAsVerified`/
`markEmailAsUnverified`, `routeNotificationForMail`, y tres pares accessor/mutator
`Attribute` que mapean `two_factor_*` (nombres fijos dentro de Fortify) a las columnas
españolas. `fortify.username`/`fortify.email` = `correo_electronico`.

### `ejecuciones_trabajo` (17 columnas)

`type`→`tipo` · `status`→`estado` · `idempotency_key`→`clave_idempotencia` ·
`correlation_id`→`correlacion_id` · `attempts`→`intentos` · `max_attempts`→
`intentos_maximos` · `progress`→`progreso` · `result`→`resultado` · `error_code`→
`codigo_error` · `error_message`→`mensaje_error` · `started_at`→`iniciado_en` ·
`finished_at`→`finalizado_en` · `queue_name`→`cola` · `resource_type`→`tipo_recurso` ·
`resource_id`→`recurso_id` (alineado con `eventos_auditoria`/`notificaciones_internas`)
· timestamps → `creado_en`/`actualizado_en`. Se renombran sus 5 índices y el índice
`unique` de idempotencia.

### Resto del dominio

- `eventos_outbox` → **`eventos_salientes`**; `payload` → `contenido`. Se redefinen la
  función `proteger_payload_outbox()` → `proteger_datos_evento_saliente()` y su trigger.
- `lock_version` (`silabos`, `ejecuciones_validacion`) y `lock_version_origen`/
  `lock_version_resultado` (`revisiones_silabo`, `ejecuciones_ia`,
  `retroalimentacion_ia`) → `version_bloqueo`, `version_bloqueo_origen`,
  `version_bloqueo_resultado`; exige redefinir `validar_ejecucion_ia()` y ajustar el
  contrato de autoguardado (`lock_version` → `version_bloqueo` en petición/respuesta).
- `revisiones_silabo.snapshot` → `fotografia` (término ya usado por la documentación).
- `locale` (`artefactos_exportacion`, `ejecuciones_ia`) → `idioma`.
- `artefactos_exportacion.version_renderer` → `version_renderizador`.
- `ejecuciones_ia.version_gateway_solicitada/ejecutada` → `version_pasarela_solicitada/
  ejecutada`.
- `eventos_auditoria.correlation_id` → `correlacion_id`; su `created_at` → `registrado_en`
  (coexiste con `ocurrido_en`).
- `notificaciones_internas.created_at` → `registrado_en` (coexiste con `creado_en`).
- `objetos_almacenados.mime` se conserva (sigla).
- Timestamps `created_at`/`updated_at` → `creado_en`/`actualizado_en` en las ~50 tablas
  restantes, incluidas las pivote (`solicitud_correccion_observaciones` solo tiene
  `created_at`). Los 51 modelos declaran constantes `CREATED_AT`/`UPDATED_AT`
  explícitas; una prueba de arquitectura nueva lo exige para siempre.

## Cambios previstos

- Dominio: ninguno (solo nombres físicos).
- Backend: modelo base con constantes de timestamps; overrides de autenticación en el
  modelo de usuario; ajuste de acciones Fortify, middleware Inertia, factories, seeders
  y toda referencia a columnas renombradas; comando artisan de renombrado de la tabla
  de control de migraciones.
- Datos: migraciones nuevas `2026_09_01_000021+` (eliminar tablas muertas; renombrar
  tablas de framework vivas; renombrar columnas de `usuarios`; renombrar timestamps de
  todas las tablas propias; renombrar columnas inglesas restantes de dominio, incluida
  la tabla `eventos_outbox` y las columnas de `ejecuciones_trabajo`; redefinir funciones
  PL/pgSQL afectadas; renombrar índices cuyo nombre contenga la palabra renombrada).
- Frontend: barrido de las páginas y tipos que consumen columnas renombradas
  (`types/auth.ts`, `Admin/Operations/Jobs.vue`, `Sources/*`, `Notifications/Index.vue`,
  `Coordination/Reviews/Show.vue`, `Coordination/Reports/Index.vue`, `settings/Profile.vue`,
  `pages/auth/*` para el campo de correo).
- Seguridad/auditoría: sin cambios de comportamiento; el flujo de login, recuperación,
  2FA y contraseña temporal se verifica explícitamente tras el renombrado.
- Trabajos/integraciones: `ejecuciones_trabajo` y outbox renombrados; worker y colas
  Redis sin cambios.
- Configuración/infra: `config/session.php`, `config/auth.php`, `config/queue.php`,
  `config/database.php`, `docker/app/entrypoint.sh`.
- Documentación: convención explícita y catálogo corregido en
  `docs/architecture/database.md` (incluye deriva detectada: `notificaciones_internas`,
  `observaciones_revision`, `transiciones_silabo`, `escuelas`, tablas retiradas);
  procedimiento de despliegue en `docs/runbooks/deploy-dokploy.md` y
  `docs/security/hardening.md`; entrada en `DECISIONS_STATUS.md`; deuda diferida en
  `docs/plans/technical-debt.md`.

## Pruebas

- Suite completa Pest sobre PostgreSQL (`composer verify`) desde base recreada.
- Ensayo de migración en caliente sobre la base local con datos (`php artisan migrate`)
  y verificación funcional por interfaz con las cuentas demo.
- Prueba de arquitectura nueva que recorre todos los modelos Eloquent y exige
  `getCreatedAtColumn()==='creado_en'`/`getUpdatedAtColumn()==='actualizado_en'` (y
  detecta columnas inglesas en `$fillable`/`$casts`), para que ningún modelo futuro
  regrese a la convención inglesa.
- Verificación manual de login, recuperación de contraseña, remember me y contraseña
  temporal con las cuentas demo.

## Pasos

- [x] Inventarios completos (modelos, columnas inglesas, funciones PL/pgSQL, usos).
- [x] Migraciones de renombrado/eliminación con `down()` completo (000021–000025).
- [x] Configuración de tablas de framework + comando `db:rename-migrations-table` +
      entrypoint; `scripts/verify-postgres-restore.sh` y `supervisord` actualizados.
- [x] Constantes en los 51 modelos; overrides de usuario y puentes Fortify/2FA.
- [x] Barrido backend (Identity, Operations, Syllabus, Academic, Configuration,
      Documents, AiAssistance, settings, dashboard, factories, seeder).
- [ ] Barrido frontend (en curso).
- [x] Pruebas de arquitectura nuevas (`SpanishModelColumnsTest`, `SpanishSchemaTest`).
- [x] Ensayo de migración en caliente local: `up` limpio sobre datos, `down` completo y
      re-aplicación verificados; esquema resultante sin identificadores ni CHECKs en
      inglés (57 tablas).
- [ ] `composer verify` en verde (pendiente del cierre de los barridos).
- [x] Documentación núcleo y deuda técnica actualizadas (database.md, hardening.md,
      deploy-dokploy.md, DECISIONS_STATUS.md, technical-debt DT-08..DT-10).
- [x] Runbook remoto listo; ejecución remota solo con confirmación explícita.

Alcance ampliado por decisión del responsable (2026-09-01): también los VALORES
almacenados (estados, roles, acciones de auditoría, discriminadores, colas, claves con
prefijo semántico) y los slugs de entidad de las rutas académicas. Se corrigió de paso
el worker de producción (no escuchaba las colas nombradas).

## Traspaso — pendiente exacto (2026-09-01, sesión e3)

Hecho y verificado: migraciones 000021–000025 (up/down ensayados en local, esquema sin
inglés), auth/Fortify probado en vivo, backend de los 6 módulos barrido, configuración,
runbooks, docs, factories/seeder, Pint en verde. Falta:

1. **13 errores de Larastan** (`composer types:check`), todos triviales del renombrado:
   `app/Models/User.php` 3× genéricos de `Attribute` sin `TGet/TSet` en los accessors
   2FA (añadir `@return Attribute<string|null, string|null>` o equivalente);
   docblocks `@property` faltantes: `AcademicSource::$actualizado_en` (+creado_en),
   `OutboxEvent::$tipo_agregado`/`$agregado_id`, `Syllabus::$actualizado_en`;
   `DeliverInternalNotificationJob` 65-92 (tipar el `findOrFail` de Syllabus);
   migración 000025: 2 docblocks `@return array<...>` en `mapas()` y
   `accionesAuditoria()`. No usar ignores.
2. **Cierre frontend y tests**: dos agentes idempotentes quedaron en vuelo
   («Cierre barrido frontend Vue/TS» y «Cierre barrido tests Pest»); si murieron,
   repetir su método: grep de cada literal viejo del mapa
   (`I-28-mapa-renombrado.md`) en `resources/js` (sin generados) y `tests/`.
   Regla clave: campo de formulario `name`→`nombre` en plantillas/fuentes/
   convocatorias/registros académicos (backend ya valida `nombre`); NO tocar
   `SpanishSchemaTest`/`SpanishModelColumnsTest` (listas negras a propósito) ni revertir
   el `AcademicStructureTest` de la sesión -ed.
3. **Suite completa**: `php artisan test` (Postgres/Redis: `podman start
   silabos-ueb-postgres silabos-ueb-redis`); iterar fallos (esperables desajustes de
   claves/valores entre capas).
4. `npm run build` (regenera wayfinder), `npm run types:check`, `npm run lint`.
5. `composer verify`: bloqueado por `temp/chartdb.sql` (security:scan; decisión del
   usuario — mover el dump o correr las piezas sueltas).
6. **Verificación UI (responsable)** con cuentas demo (`admin@silabos.test` /
   `Demo-2026!`): login, recuperación, Admin→Procesos, Fuentes y autoguardado de
   sílabo. No corresponde al agente iniciar automatización visual.
7. Cerrar plan (checkboxes, mover a `completed/` con evidencia). No commitear sin
   permiso del usuario. La rama `feat/esquema-espanol` (worktree de otra sesión) queda
   descartada y puede borrarse al cierre.
8. **Remota — SOLO con confirmación del usuario**: procedimiento en
   `docs/security/hardening.md` (pg_dump → `SELECT DISTINCT` de discriminadores →
   `db:rename-migrations-table --force` → `migrate --force --isolated` → redeploy para
   que el worker escuche las colas nuevas). El contenedor no migra al arrancar
   (`RUN_MIGRATIONS=false`).

## Riesgos y reversión

- Riesgo mayor: autenticación (login/recuperación/2FA) tras renombrar `usuarios`.
  Mitigación: puntos de extensión oficiales, pruebas de auth existentes y verificación
  manual. Reversión: `down()` de cada migración restaura nombres y tablas.
- Riesgo: funciones PL/pgSQL con nombres viejos fallan en ejecución, no al migrar.
  Mitigación: inventario dirigido de `CREATE FUNCTION`/`TRIGGER` y redefinición en la
  misma migración + suite sobre PostgreSQL real.
- Riesgo: entrypoint renombra `migrations` en un arranque con código viejo (rollback de
  imagen). El comando es idempotente y solo actúa cuando existe la tabla vieja y no la
  nueva; el código viejo con tabla vieja sigue funcionando y el nuevo con tabla nueva
  también; la ventana incompatible no existe porque config y comando viajan juntos.
- La base remota no se toca sin confirmación del responsable; antes de migrarla se
  recomienda dump manual (política formal de backups sigue en PV-11).

## Evidencia de cierre

Pendiente al cierre: salida de `composer verify`, `migrate:status` local antes/después,
capturas del flujo de login y admin de trabajos, y diff de documentación.

## Actualización de cierre parcial (2026-09-01, sesión posterior)

- [x] Barrido frontend y de pruebas cerrado contra el mapa canónico. Se corrigieron los
      formularios `nombre`, los slugs académicos y los contratos que deliberadamente
      conservan claves HTTP en inglés (`active`, métricas y contratos externos).
- [x] Larastan: `composer types:check` sin errores.
- [x] Suite PostgreSQL: `DB_DATABASE=silabos_ueb_test php artisan migrate:fresh --seed
      --force` seguido de `php artisan test --compact`: **296 pruebas, 4392 aserciones**.
- [x] Calidad frontend: Pint, `npm run types:check`, `npm run lint:check` y
      `npm run build` en verde.
- [x] Acceso local autenticado: login de `admin@silabos.test` y respuesta HTTP 200 de
      `GET /admin/usuarios` verificados con la sesión resultante. La comprobación visual
      queda asignada al responsable.
- [ ] `composer verify` sigue bloqueado únicamente en `security:scan`: detecta
      `temp/chartdb.sql` y `.claude/worktrees/esquema-espanol/docker/postgres/init/01-create-test-database.sql`.
      Ambos se preservaron; se requiere decisión explícita para moverlos o excluirlos del
      escaneo. No cerrar ni mover este plan hasta resolver esa puerta.

## Ejecución remota (2026-09-02)

- [x] Respaldo previo creado fuera del repositorio, mediante `pg_dump` y `.pgpass`.
- [x] `db:rename-migrations-table --force` ejecutado desde la estación autorizada contra
      PostgreSQL remoto; la tabla de control es `migraciones`.
- [x] Migraciones 000021–000025 aplicadas con bloqueo. Los `SELECT DISTINCT` previos a
      000025 no hallaron valores fuera del vocabulario canónico.
- [x] Verificación posterior: `migrate:status` sin pendientes y
      `GET /health/ready` respondió `200 {"status":"ready"}`. La ruta Perfil dejó de
      responder 500 y devuelve la redirección de autenticación esperada.
- [ ] Reiniciar o redeplegar el contenedor en Dokploy **sin usar Run migrations**, para
      reiniciar el worker y que escuche `critica`, `notificaciones`, `documentos`, `ia`,
      `integraciones` y `general`.
