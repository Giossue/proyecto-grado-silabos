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
| D1 | S2, S3, S5, S6, S7, S9, S10 (nombres), S11, S12 | escritor delegado (respaldo de contexto) | pendiente | — |
| D2 | S1, S4, S8 | escritor delegado | pendiente | — |
| D3 | S10 (valores de estado y modalidad) | escritor delegado | pendiente | — |
| D4 | todos | verificador independiente (riesgo 1: datos; 2: auth) + E2E | pendiente | — |

## Log

- L1 (2026-11-26): revisión de diseño (solo lectura) con 12 hallazgos; el usuario respondió S1-S12. Antes se hizo commit del trabajo de la otra sesión (628dc90) con su permiso («Sí, haz su commit»). Ruta: tres escritores en secuencia porque todos tocan `schema.prisma` y las migraciones.
