# Limpieza del diseño de la base de datos

Objetivo: aplicar los 12 arreglos de la revisión de diseño de `silabos_ueb` (2026-11-26), con migraciones Prisma, respaldo previo y pruebas.
Rama: `main` (commits por unidad, push permitido). Pruebas: Vitest api/web/shared, typecheck, lint; E2E al cerrar.

## Specs (respuestas del usuario, literales, numeradas como la revisión)

- S1. Contraseña duplicada (`usuarios.contrasena` y `cuentas_usuario.password`): «Lo que dices» → dejar solo `cuentas_usuario.password` y borrar `usuarios.contrasena`.
- S2. Restos (tabla `sesiones`, `usuarios.codigo_recordarme`, esquema `drizzle.__drizzle_migrations`): «Ok quitemos».
- S3. `firmas_silabo.silabo_id` sin atar a la revisión: «Entonces qué hacemos?» → propuesta: FK compuesta `(revision_silabo_id, silabo_id)` hacia un UNIQUE `(revision_silabo_id, silabo_id)` en `revisiones_silabo`; se conserva `silabo_id`.
- S4. Estado de los mensajes de IA dentro del JSON: «ok, entonces pongamosle» → columnas `rol`, `estado`, `codigo_error`, `completado_en`, `clave_idempotencia` en `mensajes_ia_plantilla`; en el JSON queda solo el contenido.
- S5. Triggers `comprobar_coordinacion_activa_unica` y `comprobar_administrador_exclusivo` con carrera: «ENtonces que propones» → propuesta: bloqueo por usuario/carrera (`pg_advisory_xact_lock`) antes de comprobar.
- S6. FK duplicadas con CASCADE y RESTRICT en `campos_plantilla` y `definiciones_campo`: «Ok entonces arreglemos» → dejar solo la compuesta, con el comportamiento que hoy aplica en la práctica.
- S7. FK sin índice (`notificaciones.periodo_academico_id`, `sesiones_usuario.active_role_assignment_id`): «arreglemos».
- S8. Total de horas: «Crees que el total se deba guardar? no hacemos mejor que se guarden las horas sin más? Digo y ahi que el calculo salga nomás en las mallas, qué opinas?» → de acuerdo: borrar `asignaturas.total_horas_asignatura`; el total se calcula al mostrar (malla, sílabo, fichas, exportes) con la misma regla.
- S9. Índices redundantes (`paralelos_asignatura_id_index`, `asignaturas_identidad_carrera_unica` si nada la usa, `usuarios_usuario_activo_index`): «Ok entonces quitemos».
- S10. Nombres poco uniformes (sufijos `_foreign/_fkey/_fk`, `_unique/_unica/_unico`, `_index/_idx`, nombres del modelo anterior `campania`/`proceso`, estados `abierto` vs `abierta`, enum `modalidad_estudio` con textos de pantalla): «arreglemos».
- S11. Columnas de auditoría: «Claro, toca hacer Agrega columnas "creado" o "actualizado" a cualquier cosa que cambie.» → `creado_en` y `actualizado_en` (timestamptz, `actualizado_en` puesto por un trigger) en toda tabla que cambie y no las tenga.
- S12. Sesiones vencidas: «Limpiala» → borrar las vencidas y limpiarlas periódicamente.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
|---|---|---|---|---|
| D1 | S2, S3, S5, S6, S7, S9, S10 (nombres), S11, S12 | escritor delegado (respaldo de contexto) | hecho, aplicado a `silabos_ueb`; falta commit | — |
| D2 | S1, S4, S8 | escritor delegado | pendiente | — |
| D3 | S10 (valores de estado y modalidad) | escritor delegado | pendiente | — |
| D4 | todos | verificador independiente (riesgo 1: datos; 2: auth) + E2E | pendiente | — |

## Log

- L1 (2026-11-26): revisión de diseño (solo lectura) con 12 hallazgos; el usuario respondió S1-S12. Antes se hizo commit del trabajo de la otra sesión (628dc90) con su permiso («Sí, haz su commit»). Ruta: tres escritores en secuencia porque todos tocan `schema.prisma` y las migraciones.
- L2 (2026-11-26): D1 hecho. Respaldo `respaldos/silabos-antes-limpieza-d1-20261126-004134.dump` (ignorado por git). Migraciones `20261126010000_limpiar_restos_y_relaciones` (S2, S3, S6, S7, S9 y las sesiones vencidas de S12), `20261126010100_nombres_uniformes` (S10, solo nombres) y `20261126010200_auditoria_y_bloqueos` (S5, S11). Primero se ensayaron en un contenedor podman `postgres:18` restaurado del respaldo (`migrate deploy`, catálogo, carreras simultáneas, pruebas de la API) y se borró el contenedor; después `db:migrate` en `silabos_ueb`.
  - S3: 0 firmas con `silabo_id` distinto al de su versión (la migración lo comprueba y aborta si hay). UNIQUE `revisiones_silabo_revision_silabo_id_silabo_id_unica` y FK `firmas_silabo_revision_silabo_id_silabo_id_fk` (`RESTRICT`); se quitaron las dos FK sueltas de `firmas_silabo` porque la compuesta y `revisiones_silabo_silabo_id_fk` ya las cubren.
  - S5: bloqueo `pg_advisory_xact_lock(hashtextextended(...))` por carrera (`asignaciones_rol:coordinacion:<carrera>`) y por usuario (`asignaciones_rol:usuario:<usuario>`) antes del `EXISTS`; mensajes y códigos iguales. En el ensayo, la segunda transacción esperó a la primera y falló con «La carrera ya tiene una coordinación activa» / «El rol Administrador es exclusivo».
  - S6: hoy se aplicaba `RESTRICT`: en el ensayo, borrar una sección con campos o un campo con definición fallaba por la FK compuesta aunque la suelta tuviera `CASCADE`. La app (`syncDocumentOn`) borra primero las definiciones sin valores, luego los campos sin definición y al final las secciones sin campos, así que no depende de `CASCADE`. Quedan las compuestas con `RESTRICT`; en Prisma las relaciones pasan a `campos_plantilla`/`secciones_plantilla`/`definiciones_campo[]`.
  - S9: ninguna FK ni objeto dependía de `asignaturas_identidad_carrera_unica`, `paralelos_asignatura_id_index` ni `usuarios_usuario_activo_index` (pg_depend, pg_constraint.conindid).
  - S10: convención `<tabla>_pkey`, `<tabla>_<columnas>_fk`, `<tabla>_<columnas>_unica`, `<tabla>_<columnas>_idx`, `<tabla>_<regla>_check`; si pasa de 63 caracteres o es parcial/de expresión, la parte del medio describe la regla. 57 FK, 22 únicos/PK y 51 índices renombrados, 4 CHECK, y la función `impedir_cambio_periodo_proceso_con_convocatorias` → `impedir_cambio_periodo_con_convocatorias_carrera`. Ningún código usaba nombres de restricciones (solo `on conflict (columnas)` y `sqlState`).
  - S11: `creado_en` + `actualizado_en` en asignaturas, campos_plantilla, carreras, convocatorias_carreras, convocatorias_universidad, definiciones_campo, facultades, paralelos, periodos_academicos, plantilla_silabo, requisitos_asignatura, secciones_plantilla, silabos, usuarios y valores_campo; solo `actualizado_en` donde ya había fecha de creación (asignaciones_paralelo, asignaciones_rol, documentos_apoyo, exportaciones_silabo, invitaciones_activacion, mensajes_ia_plantilla, notificaciones, propuestas_ia_plantilla); solo `creado_en` en ajustes_sistema (ya tenía `modificado_en`). Trigger `marcar_actualizado_en` (BEFORE UPDATE, solo si la fila cambia, comparando `NEW::text` porque `definicion_plantilla` es `json`), compatible con `validar_exportacion_silabo` y `proteger_notificacion`. Las filas existentes quedaron con la fecha de la migración. Sin auditoría: tablas que no se modifican y Better Auth.
  - S12: la migración borró las vencidas (241 de 324 al revisar) y las verificaciones vencidas. La cola no tiene trabajos programados, así que la limpieza va en `databaseHooks.session.create.after` de Better Auth: al abrir una sesión borra sesiones y verificaciones vencidas de todos. `restablecimientos_contrasena` no se toca (no tiene fecha de vencimiento; la vigencia se calcula en la app).
  - Evidencia: catálogo antes FK 62 / índices 121 / triggers 17 / únicos 23 / CHECK 35; después 58 / 118 / 40 / 23 / 35; 0 nombres fuera de la convención; sin `campania`/`proceso`; solo el esquema `public`. Prueba nueva en `betterAuth.test.ts` (RED y luego GREEN). `pnpm typecheck` y `pnpm lint` bien; `pnpm --filter @silabos/api test` 149 archivos / 2283 pruebas; `db:status` al día; ingreso real 200 y `/api/v1/session` 200; una sesión vencida de prueba se borró al ingresar.
