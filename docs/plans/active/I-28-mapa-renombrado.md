# I-28 — Mapa canónico de renombrado (anexo)

> Nota posterior: la regla transversal de timestamps quedó reemplazada por I-52. Las
> tablas propias ya no conservan `creado_en`, `actualizado_en` ni `registrado_en`; las
> fechas funcionales usan nombres específicos del dominio.

Referencia única para el barrido de código. Todo lo que no esté aquí **no** se renombra.

## Reglas transversales

- `created_at` → `creado_en`, `updated_at` → `actualizado_en` en todo el dominio.
  Excepción (ya tenían `creado_en` de dominio): en `notificaciones_internas`,
  `objetos_almacenados` y `observaciones_revision`, `created_at` → `registrado_en`.
- Campos de petición HTTP: `email` → `correo_electronico`, `name` → `nombre`.
  Se conservan en inglés por venir fijados por Fortify: `password`, `current_password`,
  `password_confirmation`, `remember`, `token`, `code`, `recovery_code`.
- Claves internas de JSONB **NO se tocan**: `contexto_academico` (`schema_version`,
  `curriculum.*`, `subject.*`), `fotografia` de revisiones, `contenido` del outbox
  (`recipient_ids`, `syllabus_id`, `revision_number`), `metadatos*`. Los `whereRaw` sobre
  esas claves (`contexto_academico->'subject'->>'name'`) se quedan igual.
- `resources/js/actions` y `resources/js/routes` son generados (Wayfinder): no editar.
- Siglas se conservan: `id`, `uuid`, `mime`, `url`, `ip`, `sha256`, `docx`, `pdf`,
  `es-EC`, `markdown` (nombre propio del formato).

## Columnas

### `usuarios`
`name`→`nombre` · `email`→`correo_electronico` · `email_verified_at`→`correo_verificado_en`
· `password`→`contrasena` · `active`→`activo` · `deactivated_at`→`desactivado_en` ·
`remember_token`→`codigo_recordarme` · `must_change_password`→`debe_cambiar_contrasena` ·
`two_factor_secret`→`secreto_dos_factores` · `two_factor_recovery_codes`→
`codigos_recuperacion_dos_factores` · `two_factor_confirmed_at`→`dos_factores_confirmado_en`.
(El modelo `User` ya declara los puentes; el código de app usa los nombres nuevos.)

### `ejecuciones_trabajo`
`type`→`tipo` · `status`→`estado` · `idempotency_key`→`clave_idempotencia` ·
`correlation_id`→`correlacion_id` · `attempts`→`intentos` · `max_attempts`→
`intentos_maximos` · `progress`→`progreso` · `result`→`resultado` · `error_code`→
`codigo_error` · `error_message`→`mensaje_error` · `started_at`→`iniciado_en` ·
`finished_at`→`finalizado_en` · `queue_name`→`cola` · `resource_type`→`tipo_recurso` ·
`resource_id`→`recurso_id`.

### Resto
- `eventos_outbox` → tabla **`eventos_salientes`**; `payload`→`contenido`.
- `eventos_auditoria.correlation_id`→`correlacion_id`.
- `silabos.lock_version` y `ejecuciones_validacion.lock_version` → `version_bloqueo`.
- `revisiones_silabo`: `lock_version_origen`→`version_bloqueo_origen`, `snapshot`→`fotografia`.
- `ejecuciones_ia`: `lock_version_origen`→`version_bloqueo_origen`, `locale`→`idioma`,
  `version_gateway_solicitada/ejecutada`→`version_pasarela_solicitada/ejecutada`.
- `retroalimentacion_ia`: `lock_version_origen/resultado`→`version_bloqueo_origen/resultado`.
- `artefactos_exportacion`: `locale`→`idioma`, `version_renderer`→`version_renderizador`.
- Tablas framework: `sessions`→`sesiones`, `failed_jobs`→`trabajos_fallidos`,
  `password_reset_tokens`→`restablecimientos_contrasena`, `migrations`→`migraciones`;
  `jobs`, `job_batches`, `cache`, `cache_locks` eliminadas.

## Valores almacenados

- Estados de sílabo (`silabos.estado`, `transiciones_silabo.estado_origen/destino`):
  `not_started`→`sin_iniciar`, `draft`→`borrador`, `in_review`→`en_revision`,
  `correction_requested`→`correccion_solicitada`, `approved`→`aprobado`.
- `transiciones_silabo.accion`: `submit`→`enviar`, `request_correction`→
  `solicitar_correccion`, `resubmit`→`reenviar`, `approve`→`aprobar`, `reopen`→`reabrir`.
- `ejecuciones_trabajo.estado`: `pending`→`pendiente`, `running`→`en_ejecucion`,
  `completed`→`completada`, `failed`→`fallida`.
- `artefactos_exportacion.estado`: `pending`→`pendiente`, `running`→`en_ejecucion`,
  `completed`→`completado`, `failed`→`fallido`.
- `eventos_salientes.estado`: `pending`→`pendiente`, `processing`→`en_proceso`,
  `processed`→`procesado`, `failed`→`fallido`.
- `ejecuciones_ia.estado`: `pending`→`pendiente`, `running`→`en_ejecucion`,
  `completed`→`completada`, `inconclusive`→`no_concluyente`, `failed`→`fallida`.
- `ejecuciones_validacion.estado`: `completed`→`completada`, `failed`→`fallida`.
- `versiones_plantilla.estado`: `draft`→`borrador`, `published`→`publicada`.
- `versiones_malla.estado`: `active`→`activa`, `inactive`→`inactiva`, `historical`→`historica`.
- `convocatorias.estado`: `preparation`→`preparacion`, `open`→`abierta`, `closed`→`cerrada`;
  `modo_agrupacion`: `per_offering`→`por_oferta`, `per_parallel`→`por_paralelo`.
- `fechas_limite_convocatoria.etapa`: `start`→`inicio`, `draft`→`borrador`,
  `review`→`revision`, `correction`→`correccion`.
- `observaciones_revision.estado`: `open`→`abierta`, `responded`→`respondida`,
  `verified`→`verificada`.
- `objetos_almacenados.estado`: `active`→`activo`, `quarantined`→`en_cuarentena`.
- `resultados_validacion.severidad`: `warning`→`advertencia` (`error` se queda);
  `codigo`: `required_field_missing`→`campo_obligatorio_faltante`,
  `required_master_missing`→`maestro_obligatorio_faltante`.
- `recomendaciones_ia.tipo`: `clarity`→`claridad`, `consistency`→`consistencia`
  (`editorial` se queda).
- `retroalimentacion_ia.decision`: `accepted`→`aceptada`, `ignored`→`ignorada`,
  `not_useful`→`no_util`, `applied`→`aplicada`.
- `ejecuciones_ia.motivo_no_concluyente`: `evidence_limit_exceeded`→
  `limite_evidencia_excedido`, `insufficient_evidence`→`evidencia_insuficiente`,
  `empty_content`→`contenido_vacio`, `no_editorial_change`→`sin_cambio_editorial`.
- `bloques_plantilla.tipo`: `group`→`grupo`, `fields`→`campos`, `repeatable`→`repetible`,
  `narrative`→`narrativa`, `workflow`→`flujo`.
- `definiciones_campo.tipo`: `short_text`→`texto_corto`, `long_text`→`texto_largo`,
  `number`→`numero`, `date`→`fecha`, `single_select`→`seleccion_unica`,
  `multi_select`→`seleccion_multiple`, `boolean`→`booleano`, `repeatable`→`repetible`,
  `calculation`→`calculo`, `master_reference`→`referencia_maestra` (`markdown` se queda).
- `definiciones_campo_malla.tipo`: `text`→`texto`, `number`→`numero`, `integer`→`entero`,
  `boolean`→`booleano`; `clave_sistema`: `hours_ac`→`horas_ac`, `hours_pae`→`horas_pae`,
  `hours_aa`→`horas_aa`, `credits`→`creditos`, `total_hours`→`horas_totales`.
- `requisitos_asignatura.tipo`: `prerequisite`→`prerrequisito`, `corequisite`→`correquisito`.
- `roles.codigo` (`RoleCode`): `administrator`→`administrador`, `coordinator`→
  `coordinador`, `teacher`→`docente`.
- `sustento_tipo`: `personnel_action`→`accion_personal`, `resolution`→`resolucion`,
  `official_letter`→`oficio`.
- `eventos_auditoria.resultado`: `success`→`exito`, `denied`→`denegado`, `failed`→`fallido`.
- Tipos de trabajo (`ejecuciones_trabajo.tipo`): `ai.analysis`→`ia.analisis`,
  `document.export`→`documento.exportacion`, `notification.internal`→
  `notificacion.interna`, `platform.smoke`→`plataforma.verificacion`.
- Colas (Redis y columna `cola`): `ai`→`ia`, `documents`→`documentos`,
  `notifications`→`notificaciones`, `critical`→`critica`,
  `integrations`→`integraciones`, `default`→`general`.
- Códigos de error: `document_export_failed`→`exportacion_documento_fallida`,
  `internal_notification_failed`→`notificacion_interna_fallida`,
  `platform_smoke_failed`→`verificacion_plataforma_fallida`.
- Eventos de flujo (`tipo_evento` del outbox y `tipo` de notificaciones):
  `syllabus.submitted`→`silabo.enviado`, `syllabus.resubmitted`→`silabo.reenviado`,
  `syllabus.approved`→`silabo.aprobado`, `syllabus.reopened`→`silabo.reabierto`,
  `syllabus.correction_requested`→`silabo.correccion_solicitada`.
- Prefijos de claves de idempotencia/deduplicación:
  `notification.outbox:`→`notificacion.saliente:`, `document.export:`→
  `documento.exportacion:`, `document.export.completed:`→
  `documento.exportacion.completada:`, `ai.analysis:`→`ia.analisis:`,
  `ai.analysis.{estado}:`→`ia.analisis.{estado}:`, `workflow:`→`flujo:`,
  `platform.smoke`→`plataforma.verificacion`.

## Slugs de entidad académica (ruta `{entity}`, `tipo_recurso` y auditoría)

`faculty`→`facultad` · `school`→`escuela` · `career`→`carrera` · `campus`→`campus` ·
`modality`→`modalidad` · `period`→`periodo` · `curriculum`→`malla` ·
`curriculum_field`→`campo_malla` · `subject`→`asignatura` · `offering`→`oferta` ·
`parallel`→`paralelo` · `teacher_assignment`→`asignacion_docente` ·
`coordinator_assignment`→`asignacion_coordinador` · `requirement`→`requisito`.

Otros `tipo_recurso`/`resource_type`: `syllabus`→`silabo`, `syllabus_revision`→
`revision_silabo`, `syllabus_template`→`plantilla_silabo`, `template_version`→
`version_plantilla`, `template_section`→`seccion_plantilla`, `template_block`→
`bloque_plantilla`, `field_definition`→`definicion_campo`, `academic_source`→
`fuente_academica`, `convocation`→`convocatoria`, `correction_request`→
`solicitud_correccion`, `review_observation`→`observacion_revision`,
`observation_response`→`respuesta_observacion`, `approval`→`aprobacion`,
`reopening`→`reapertura`, `export_artifact`→`artefacto_exportacion`,
`ai_execution`→`ejecucion_ia`, `ai_recommendation`→`recomendacion_ia`,
`job_execution`→`ejecucion_trabajo`, `outbox_event`→`evento_saliente`,
`role_assignment`→`asignacion_rol`, `user`→`usuario`, `test`→`prueba`.

## Acciones de auditoría (literales en código)

Prefijos: `academic.`→`academico.`, `syllabus.`→`silabo.`, `template.`→`plantilla.`,
`source.`→`fuente.`, `convocation.`→`convocatoria.`, `document.`→`documento.`,
`ai.`→`ia.`, `user.`→`usuario.`, `job.`→`trabajo.`, `active_role.`→`rol_activo.`.
Sufijos dinámicos académicos: `.created`→`.creacion`, `.updated`→`.actualizacion`,
`.status_changed`→`.cambio_estado`, `.deleted`→`.eliminacion`,
`.configuration_updated`→`.configuracion_actualizada`, `.layout_updated`→
`.posicion_actualizada`. El mapa completo literal a literal está en la migración
`2026_09_01_000025_translate_stored_values_to_spanish.php` (constante
`ACCIONES_AUDITORIA`): el código debe escribir exactamente esos valores nuevos.
