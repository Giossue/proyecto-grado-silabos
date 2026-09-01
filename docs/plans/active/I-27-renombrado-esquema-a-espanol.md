# I-27: Esquema de base de datos 100 % en español

## Estado

En curso — iniciado el 2026-09-01.

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
8. **Valores en inglés dentro de datos y `CHECK`s** (p. ej. estados `active`/`inactive`)
   son datos, no identificadores: quedan fuera de este incremento y se registran en
   deuda técnica como candidato a incremento propio.
9. Los nombres de archivo de migraciones (datos históricos de la tabla `migraciones`) no
   se reescriben: editar migraciones aplicadas está prohibido por convención.

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

- [ ] Inventarios completos (modelos, columnas inglesas, funciones PL/pgSQL, usos).
- [ ] Migraciones de renombrado/eliminación con `down()` completo.
- [ ] Configuración de tablas de framework + comando y entrypoint para `migraciones`.
- [ ] Modelo base + constantes en todos los modelos; overrides de usuario y Fortify.
- [ ] Barrido backend (acciones, consultas, factories, seeders, notificaciones).
- [ ] Barrido frontend (tipos y páginas listadas).
- [ ] Prueba de arquitectura de convención de columnas.
- [ ] `composer verify` en verde + ensayo de migración en caliente local.
- [ ] Documentación y deuda técnica actualizadas.
- [ ] Runbook remoto listo; ejecución remota solo con confirmación explícita.

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
