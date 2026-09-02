<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Traduce a español los valores almacenados en inglés (I-28): estados, tipos, acciones
 * de auditoría, discriminadores de recurso, colas y claves con prefijo semántico.
 *
 * - Los CHECK constraints se recrean con el vocabulario nuevo (y el prefijo
 *   `campanias_` obsoleto pasa a `convocatorias_`).
 * - Los triggers de inmutabilidad se desactivan solo durante el UPDATE: es un cambio de
 *   representación del histórico, no de contenido; la migración es el registro auditable.
 * - Los índices parciales cuyo predicado fija valores (`estado IN (...)`,
 *   `decision = 'applied'`) se recrean con los valores traducidos.
 * - Las funciones PL/pgSQL que comparan estados se redefinen con el vocabulario nuevo.
 * - Todo mapa usa CASE con ELSE conservador: un valor histórico fuera del vocabulario
 *   conocido se conserva tal cual (verificar DISTINCT antes de aplicar en remoto).
 * - Las claves internas de los JSONB (fotografías de revisiones, contenido del outbox,
 *   metadatos) NO se tocan: son evidencia sellada (deuda registrada en I-28).
 */
return new class extends Migration
{
    private const RECURSOS = [
        'academic_source' => 'fuente_academica',
        'ai_execution' => 'ejecucion_ia',
        'ai_recommendation' => 'recomendacion_ia',
        'approval' => 'aprobacion',
        'campus' => 'campus',
        'career' => 'carrera',
        'convocation' => 'convocatoria',
        'coordinator_assignment' => 'asignacion_coordinador',
        'correction_request' => 'solicitud_correccion',
        'curriculum' => 'malla',
        'curriculum_field' => 'campo_malla',
        'export_artifact' => 'artefacto_exportacion',
        'faculty' => 'facultad',
        'field_definition' => 'definicion_campo',
        'job_execution' => 'ejecucion_trabajo',
        'modality' => 'modalidad',
        'observation_response' => 'respuesta_observacion',
        'offering' => 'oferta',
        'outbox_event' => 'evento_saliente',
        'parallel' => 'paralelo',
        'period' => 'periodo',
        'reopening' => 'reapertura',
        'requirement' => 'requisito',
        'review_observation' => 'observacion_revision',
        'role_assignment' => 'asignacion_rol',
        'school' => 'escuela',
        'subject' => 'asignatura',
        'syllabus' => 'silabo',
        'syllabus_revision' => 'revision_silabo',
        'syllabus_template' => 'plantilla_silabo',
        'teacher_assignment' => 'asignacion_docente',
        'template_block' => 'bloque_plantilla',
        'template_section' => 'seccion_plantilla',
        'template_version' => 'version_plantilla',
        'test' => 'prueba',
        'user' => 'usuario',
    ];

    private const ACCIONES_AUDITORIA = [
        'active_role.selected' => 'rol_activo.seleccionado',
        'user.created' => 'usuario.creado',
        'user.activated' => 'usuario.activado',
        'user.deactivated' => 'usuario.desactivado',
        'user.role_assigned' => 'usuario.rol_asignado',
        'user.profile_updated' => 'usuario.perfil_actualizado',
        'user.temporary_password_changed' => 'usuario.contrasena_temporal_cambiada',
        'job.retry_requested' => 'trabajo.reintento_solicitado',
        'template.created' => 'plantilla.creada',
        'template.version_published' => 'plantilla.version_publicada',
        'template.version_cloned' => 'plantilla.version_clonada',
        'template.section_created' => 'plantilla.seccion_creada',
        'template.section_updated' => 'plantilla.seccion_actualizada',
        'template.section_deleted' => 'plantilla.seccion_eliminada',
        'template.sections_reordered' => 'plantilla.secciones_reordenadas',
        'template.block_deleted' => 'plantilla.bloque_eliminado',
        'template.blocks_reordered' => 'plantilla.bloques_reordenados',
        'template.field_created' => 'plantilla.campo_creado',
        'template.field_updated' => 'plantilla.campo_actualizado',
        'source.created' => 'fuente.creada',
        'source.updated' => 'fuente.actualizada',
        'source.content_updated' => 'fuente.contenido_actualizado',
        'syllabus.draft_started' => 'silabo.borrador_iniciado',
        'syllabus.field_saved' => 'silabo.campo_guardado',
        'syllabus.validated' => 'silabo.validado',
        'syllabus.submit' => 'silabo.enviado',
        'syllabus.resubmit' => 'silabo.reenviado',
        'syllabus.approved' => 'silabo.aprobado',
        'syllabus.reopened' => 'silabo.reabierto',
        'syllabus.correction_requested' => 'silabo.correccion_solicitada',
        'syllabus.observation_added' => 'silabo.observacion_agregada',
        'syllabus.observation_responded' => 'silabo.observacion_respondida',
        'syllabus.observation_verified' => 'silabo.observacion_verificada',
        'syllabus.teacher_transferred' => 'silabo.docente_transferido',
        'convocation.created' => 'convocatoria.creada',
        'convocation.opened' => 'convocatoria.abierta',
        'convocation.deadline_extended' => 'convocatoria.plazo_extendido',
        'document.export_requested' => 'documento.exportacion_solicitada',
        'document.export_completed' => 'documento.exportacion_completada',
        'document.export_failed' => 'documento.exportacion_fallida',
        'document.downloaded' => 'documento.descargado',
        'ai.analysis_requested' => 'ia.analisis_solicitado',
        'ai.analysis_completed' => 'ia.analisis_completado',
        'ai.analysis_inconclusive' => 'ia.analisis_no_concluyente',
        'ai.analysis_failed' => 'ia.analisis_fallido',
        'ai.analysis_reused' => 'ia.analisis_reutilizado',
        'academic.curriculum.deleted' => 'academico.malla.eliminacion',
        'academic.curriculum.configuration_updated' => 'academico.malla.configuracion_actualizada',
        'academic.curriculum_field.created' => 'academico.campo_malla.creacion',
        'academic.curriculum_field.deleted' => 'academico.campo_malla.eliminacion',
        'academic.subject_requirement.created' => 'academico.requisito_asignatura.creacion',
        'academic.subject_requirement.deleted' => 'academico.requisito_asignatura.eliminacion',
        'academic.subject.deleted' => 'academico.asignatura.eliminacion',
        'academic.subject.layout_updated' => 'academico.asignatura.posicion_actualizada',
        'ai.recommendation_accepted' => 'ia.recomendacion_aceptada',
        'ai.recommendation_ignored' => 'ia.recomendacion_ignorada',
        'ai.recommendation_not_useful' => 'ia.recomendacion_no_util',
        'ai.recommendation_applied' => 'ia.recomendacion_aplicada',
    ];

    private const EVENTOS_FLUJO = [
        'syllabus.submitted' => 'silabo.enviado',
        'syllabus.resubmitted' => 'silabo.reenviado',
        'syllabus.approved' => 'silabo.aprobado',
        'syllabus.reopened' => 'silabo.reabierto',
        'syllabus.correction_requested' => 'silabo.correccion_solicitada',
    ];

    private const ESTADOS_SILABO = [
        'not_started' => 'sin_iniciar',
        'draft' => 'borrador',
        'in_review' => 'en_revision',
        'correction_requested' => 'correccion_solicitada',
        'approved' => 'aprobado',
    ];

    /**
     * Acciones de auditoría compuestas: academic.{entidad}.{evento}.
     *
     * @return array<string, string>
     */
    private function accionesAuditoria(): array
    {
        $acciones = self::ACCIONES_AUDITORIA;
        $eventos = ['created' => 'creacion', 'updated' => 'actualizacion', 'status_changed' => 'cambio_estado'];
        $entidades = [
            'faculty', 'school', 'career', 'campus', 'modality', 'period', 'curriculum',
            'subject', 'offering', 'parallel', 'teacher_assignment', 'coordinator_assignment',
            'requirement',
        ];

        foreach ($entidades as $entidad) {
            foreach ($eventos as $ingles => $espanol) {
                $acciones["academic.{$entidad}.{$ingles}"] = 'academico.'.self::RECURSOS[$entidad].".{$espanol}";
            }
        }

        return $acciones;
    }

    /**
     * [tabla => [columna => mapa]] para las traducciones directas por CASE.
     *
     * @return array<string, array<string, array<string, string>>>
     */
    private function mapas(): array
    {
        $sustento = [
            'personnel_action' => 'accion_personal',
            'resolution' => 'resolucion',
            'official_letter' => 'oficio',
        ];

        return [
            'roles' => [
                'codigo' => ['administrator' => 'administrador', 'coordinator' => 'coordinador', 'teacher' => 'docente'],
            ],
            'requisitos_asignatura' => [
                'tipo' => ['prerequisite' => 'prerrequisito', 'corequisite' => 'correquisito'],
            ],
            'asignaciones_docente' => ['sustento_tipo' => $sustento],
            'asignaciones_coordinador' => ['sustento_tipo' => $sustento],
            'versiones_malla' => [
                'estado' => ['active' => 'activa', 'inactive' => 'inactiva', 'historical' => 'historica', 'draft' => 'historica', 'published' => 'historica'],
            ],
            'versiones_plantilla' => [
                'estado' => ['draft' => 'borrador', 'published' => 'publicada'],
            ],
            'bloques_plantilla' => [
                'tipo' => ['group' => 'grupo', 'fields' => 'campos', 'repeatable' => 'repetible', 'narrative' => 'narrativa', 'workflow' => 'flujo'],
            ],
            'valores_campo' => [
                'origen' => ['workflow' => 'flujo'],
            ],
            'definiciones_campo' => [
                'origen_maestro' => ['workflow' => 'flujo'],
                'tipo' => [
                    'short_text' => 'texto_corto', 'long_text' => 'texto_largo',
                    'number' => 'numero', 'date' => 'fecha',
                    'single_select' => 'seleccion_unica', 'multi_select' => 'seleccion_multiple',
                    'boolean' => 'booleano', 'repeatable' => 'repetible',
                    'calculation' => 'calculo', 'master_reference' => 'referencia_maestra',
                ],
            ],
            'definiciones_campo_malla' => [
                'tipo' => ['text' => 'texto', 'number' => 'numero', 'integer' => 'entero', 'boolean' => 'booleano'],
                'clave_sistema' => ['hours_ac' => 'horas_ac', 'hours_pae' => 'horas_pae', 'hours_aa' => 'horas_aa', 'credits' => 'creditos', 'total_hours' => 'horas_totales'],
            ],
            'convocatorias' => [
                'estado' => ['preparation' => 'preparacion', 'open' => 'abierta', 'closed' => 'cerrada'],
                'modo_agrupacion' => ['per_offering' => 'por_oferta', 'per_parallel' => 'por_paralelo'],
            ],
            'fechas_limite_convocatoria' => [
                'etapa' => ['start' => 'inicio', 'draft' => 'borrador', 'review' => 'revision', 'correction' => 'correccion'],
            ],
            'silabos' => ['estado' => self::ESTADOS_SILABO],
            'transiciones_silabo' => [
                'accion' => ['submit' => 'enviar', 'request_correction' => 'solicitar_correccion', 'resubmit' => 'reenviar', 'approve' => 'aprobar', 'reopen' => 'reabrir'],
                'estado_origen' => self::ESTADOS_SILABO,
                'estado_destino' => self::ESTADOS_SILABO,
            ],
            'ejecuciones_validacion' => [
                'estado' => ['completed' => 'completada', 'failed' => 'fallida'],
            ],
            'resultados_validacion' => [
                'severidad' => ['warning' => 'advertencia'],
                'codigo' => ['required_field_missing' => 'campo_obligatorio_faltante', 'required_master_missing' => 'maestro_obligatorio_faltante'],
            ],
            'observaciones_revision' => [
                'estado' => ['open' => 'abierta', 'responded' => 'respondida', 'verified' => 'verificada'],
            ],
            'objetos_almacenados' => [
                'estado' => ['active' => 'activo', 'quarantined' => 'en_cuarentena'],
            ],
            'artefactos_exportacion' => [
                'estado' => ['pending' => 'pendiente', 'running' => 'en_ejecucion', 'completed' => 'completado', 'failed' => 'fallido'],
            ],
            'eventos_salientes' => [
                'estado' => ['pending' => 'pendiente', 'processing' => 'en_proceso', 'processed' => 'procesado', 'failed' => 'fallido'],
                'tipo_agregado' => ['syllabus' => 'silabo'],
                'tipo_evento' => self::EVENTOS_FLUJO,
            ],
            'notificaciones_internas' => [
                'tipo' => self::EVENTOS_FLUJO,
                'tipo_recurso' => self::RECURSOS,
            ],
            'eventos_auditoria' => [
                'resultado' => ['success' => 'exito', 'denied' => 'denegado', 'failed' => 'fallido'],
                'accion' => $this->accionesAuditoria(),
                'tipo_recurso' => self::RECURSOS,
            ],
            'ejecuciones_trabajo' => [
                'estado' => ['pending' => 'pendiente', 'running' => 'en_ejecucion', 'completed' => 'completada', 'failed' => 'fallida'],
                'tipo' => ['ai.analysis' => 'ia.analisis', 'document.export' => 'documento.exportacion', 'notification.internal' => 'notificacion.interna', 'platform.smoke' => 'plataforma.verificacion'],
                'cola' => ['ai' => 'ia', 'documents' => 'documentos', 'notifications' => 'notificaciones', 'critical' => 'critica', 'integrations' => 'integraciones', 'default' => 'general'],
                'codigo_error' => [
                    'document_export_failed' => 'exportacion_documento_fallida',
                    'internal_notification_failed' => 'notificacion_interna_fallida',
                    'platform_smoke_failed' => 'verificacion_plataforma_fallida',
                    'ai_analysis_failed' => 'analisis_ia_fallido',
                    'ai_contract_invalid' => 'contrato_ia_invalido',
                    'ai_service_unavailable' => 'servicio_ia_no_disponible',
                ],
                'tipo_recurso' => self::RECURSOS,
            ],
            'ejecuciones_ia' => [
                'estado' => ['pending' => 'pendiente', 'running' => 'en_ejecucion', 'completed' => 'completada', 'inconclusive' => 'no_concluyente', 'failed' => 'fallida'],
                'motivo_no_concluyente' => [
                    'evidence_limit_exceeded' => 'limite_evidencia_excedido',
                    'insufficient_evidence' => 'evidencia_insuficiente',
                    'empty_content' => 'contenido_vacio',
                    'no_editorial_change' => 'sin_cambio_editorial',
                ],
                'codigo_error' => [
                    'ai_analysis_failed' => 'analisis_ia_fallido',
                    'ai_contract_invalid' => 'contrato_ia_invalido',
                    'ai_service_unavailable' => 'servicio_ia_no_disponible',
                ],
            ],
            'recomendaciones_ia' => [
                'tipo' => ['clarity' => 'claridad', 'consistency' => 'consistencia'],
            ],
            'retroalimentacion_ia' => [
                'decision' => ['accepted' => 'aceptada', 'ignored' => 'ignorada', 'not_useful' => 'no_util', 'applied' => 'aplicada'],
            ],
        ];
    }

    /** Prefijos semánticos dentro de claves de idempotencia y deduplicación. */
    private const PREFIJOS = [
        'ejecuciones_trabajo' => [
            'clave_idempotencia' => [
                'notification.outbox:' => 'notificacion.saliente:',
                'document.export:' => 'documento.exportacion:',
                'ai.analysis:' => 'ia.analisis:',
                'platform.smoke' => 'plataforma.verificacion',
            ],
        ],
        'notificaciones_internas' => [
            'clave_deduplicacion' => ['workflow:' => 'flujo:'],
        ],
        'eventos_salientes' => [
            'clave_deduplicacion' => [
                'document.export.completed:' => 'documento.exportacion.completada:',
                'ai.analysis.' => 'ia.analisis.',
                'syllabus' => 'silabo',
            ],
        ],
    ];

    /** Tablas con triggers de inmutabilidad/validación que bloquean el UPDATE. */
    private const TABLAS_PROTEGIDAS = [
        'eventos_salientes', 'eventos_auditoria', 'transiciones_silabo',
        'objetos_almacenados', 'artefactos_exportacion', 'ejecuciones_ia',
        'retroalimentacion_ia', 'recomendaciones_ia', 'notificaciones_internas',
        'versiones_plantilla', 'bloques_plantilla', 'definiciones_campo',
        'observaciones_revision', 'revisiones_silabo',
    ];

    public function up(): void
    {
        $this->soltarChecks();
        $this->conTriggersDesactivados(function (): void {
            $this->traducir(false);
        });
        $this->crearChecksEnEspanol();
        $this->ajustarDefaults(false);
        $this->recrearIndicesParciales(false);
        $this->redefinirFuncionesConValoresEnEspanol();
    }

    public function down(): void
    {
        $this->restaurarFuncionesConValoresEnIngles();
        $this->recrearIndicesParciales(true);
        $this->ajustarDefaults(true);
        $this->soltarChecksEnEspanol();
        $this->conTriggersDesactivados(function (): void {
            $this->traducir(true);
        });
        $this->crearChecksOriginales();
    }

    private function conTriggersDesactivados(callable $bloque): void
    {
        foreach (self::TABLAS_PROTEGIDAS as $tabla) {
            DB::statement("ALTER TABLE {$tabla} DISABLE TRIGGER USER");
        }

        try {
            $bloque();
        } finally {
            foreach (self::TABLAS_PROTEGIDAS as $tabla) {
                DB::statement("ALTER TABLE {$tabla} ENABLE TRIGGER USER");
            }
        }
    }

    private function traducir(bool $inverso): void
    {
        foreach ($this->mapas() as $tabla => $columnas) {
            foreach ($columnas as $columna => $mapa) {
                $pares = $inverso ? array_flip($mapa) : $mapa;
                $case = "CASE {$columna}";
                foreach ($pares as $desde => $hacia) {
                    $case .= " WHEN '{$desde}' THEN '{$hacia}'";
                }
                $case .= " ELSE {$columna} END";
                $llaves = "'".implode("', '", array_keys($pares))."'";
                DB::statement("UPDATE {$tabla} SET {$columna} = {$case} WHERE {$columna} IN ({$llaves})");
            }
        }

        foreach (self::PREFIJOS as $tabla => $columnas) {
            foreach ($columnas as $columna => $mapa) {
                $pares = $inverso ? array_flip($mapa) : $mapa;
                foreach ($pares as $desde => $hacia) {
                    DB::statement(
                        "UPDATE {$tabla} SET {$columna} = REPLACE({$columna}, '{$desde}', '{$hacia}') WHERE {$columna} LIKE '{$desde}%'"
                    );
                }
            }
        }
    }

    private function soltarChecks(): void
    {
        foreach ([
            'versiones_malla DROP CONSTRAINT versiones_malla_estado_check',
            'eventos_auditoria DROP CONSTRAINT eventos_auditoria_resultado_check',
            'versiones_plantilla DROP CONSTRAINT versiones_plantilla_estado_check',
            'bloques_plantilla DROP CONSTRAINT bloques_plantilla_tipo_check',
            'definiciones_campo DROP CONSTRAINT definiciones_campo_tipo_check',
            'definiciones_campo_malla DROP CONSTRAINT campos_malla_tipo_check',
            'convocatorias DROP CONSTRAINT campanias_estado_check',
            'convocatorias DROP CONSTRAINT campanias_agrupacion_check',
            'fechas_limite_convocatoria DROP CONSTRAINT fechas_limite_etapa_check',
            'silabos DROP CONSTRAINT silabos_estado_check',
            'transiciones_silabo DROP CONSTRAINT transiciones_silabo_accion_check',
            'transiciones_silabo DROP CONSTRAINT transiciones_silabo_flujo_check',
            'ejecuciones_validacion DROP CONSTRAINT ejecuciones_validacion_estado_check',
            'resultados_validacion DROP CONSTRAINT resultados_validacion_severidad_check',
            'observaciones_revision DROP CONSTRAINT observaciones_revision_estado_check',
            'objetos_almacenados DROP CONSTRAINT objetos_almacenados_estado_check',
            'artefactos_exportacion DROP CONSTRAINT artefactos_exportacion_estado_check',
            'artefactos_exportacion DROP CONSTRAINT artefactos_exportacion_completitud_check',
            'eventos_salientes DROP CONSTRAINT eventos_salientes_estado_check',
            'ejecuciones_trabajo DROP CONSTRAINT ejecuciones_trabajo_estado_check',
            'ejecuciones_ia DROP CONSTRAINT ejecuciones_ia_estado_check',
            'ejecuciones_ia DROP CONSTRAINT ejecuciones_ia_terminal_check',
            'recomendaciones_ia DROP CONSTRAINT recomendaciones_ia_tipo_check',
            'retroalimentacion_ia DROP CONSTRAINT retroalimentacion_ia_decision_check',
            'retroalimentacion_ia DROP CONSTRAINT retroalimentacion_ia_aplicacion_check',
        ] as $sql) {
            DB::statement("ALTER TABLE {$sql}");
        }
    }

    private function crearChecksEnEspanol(): void
    {
        foreach ([
            "versiones_malla ADD CONSTRAINT versiones_malla_estado_check CHECK (estado IN ('activa', 'inactiva', 'historica'))",
            "eventos_auditoria ADD CONSTRAINT eventos_auditoria_resultado_check CHECK (resultado IN ('exito', 'denegado', 'fallido'))",
            "versiones_plantilla ADD CONSTRAINT versiones_plantilla_estado_check CHECK (estado IN ('borrador', 'publicada'))",
            "bloques_plantilla ADD CONSTRAINT bloques_plantilla_tipo_check CHECK (tipo IN ('grupo', 'campos', 'repetible', 'narrativa', 'flujo'))",
            "definiciones_campo ADD CONSTRAINT definiciones_campo_tipo_check CHECK (tipo IN ('texto_corto', 'texto_largo', 'markdown', 'numero', 'fecha', 'seleccion_unica', 'seleccion_multiple', 'booleano', 'repetible', 'calculo', 'referencia_maestra'))",
            "definiciones_campo_malla ADD CONSTRAINT campos_malla_tipo_check CHECK (tipo IN ('texto', 'numero', 'entero', 'booleano'))",
            "convocatorias ADD CONSTRAINT convocatorias_estado_check CHECK (estado IN ('preparacion', 'abierta', 'cerrada'))",
            "convocatorias ADD CONSTRAINT convocatorias_agrupacion_check CHECK (modo_agrupacion IN ('por_oferta', 'por_paralelo'))",
            "fechas_limite_convocatoria ADD CONSTRAINT fechas_limite_etapa_check CHECK (etapa IN ('inicio', 'borrador', 'revision', 'correccion'))",
            "silabos ADD CONSTRAINT silabos_estado_check CHECK (estado IN ('sin_iniciar', 'borrador', 'en_revision', 'correccion_solicitada', 'aprobado'))",
            "transiciones_silabo ADD CONSTRAINT transiciones_silabo_accion_check CHECK (accion IN ('enviar', 'solicitar_correccion', 'reenviar', 'aprobar', 'reabrir'))",
            "transiciones_silabo ADD CONSTRAINT transiciones_silabo_flujo_check CHECK ((accion = 'enviar' AND estado_origen = 'borrador' AND estado_destino = 'en_revision') OR (accion = 'solicitar_correccion' AND estado_origen = 'en_revision' AND estado_destino = 'correccion_solicitada') OR (accion = 'reenviar' AND estado_origen = 'correccion_solicitada' AND estado_destino = 'en_revision') OR (accion = 'aprobar' AND estado_origen = 'en_revision' AND estado_destino = 'aprobado') OR (accion = 'reabrir' AND estado_origen = 'aprobado' AND estado_destino = 'correccion_solicitada'))",
            "ejecuciones_validacion ADD CONSTRAINT ejecuciones_validacion_estado_check CHECK (estado IN ('completada', 'fallida'))",
            "resultados_validacion ADD CONSTRAINT resultados_validacion_severidad_check CHECK (severidad IN ('error', 'advertencia'))",
            "observaciones_revision ADD CONSTRAINT observaciones_revision_estado_check CHECK (estado IN ('abierta', 'respondida', 'verificada'))",
            "objetos_almacenados ADD CONSTRAINT objetos_almacenados_estado_check CHECK (estado IN ('activo', 'en_cuarentena'))",
            "artefactos_exportacion ADD CONSTRAINT artefactos_exportacion_estado_check CHECK (estado IN ('pendiente', 'en_ejecucion', 'completado', 'fallido'))",
            "artefactos_exportacion ADD CONSTRAINT artefactos_exportacion_completitud_check CHECK ((estado = 'completado' AND objeto_docx_id IS NOT NULL AND objeto_pdf_id IS NOT NULL AND completado_en IS NOT NULL) OR estado <> 'completado')",
            "eventos_salientes ADD CONSTRAINT eventos_salientes_estado_check CHECK (estado IN ('pendiente', 'en_proceso', 'procesado', 'fallido'))",
            "ejecuciones_trabajo ADD CONSTRAINT ejecuciones_trabajo_estado_check CHECK (estado IN ('pendiente', 'en_ejecucion', 'completada', 'fallida'))",
            "ejecuciones_ia ADD CONSTRAINT ejecuciones_ia_estado_check CHECK (estado IN ('pendiente', 'en_ejecucion', 'completada', 'no_concluyente', 'fallida'))",
            "ejecuciones_ia ADD CONSTRAINT ejecuciones_ia_terminal_check CHECK ((estado = 'completada' AND version_pasarela_ejecutada IS NOT NULL AND completado_en IS NOT NULL AND motivo_no_concluyente IS NULL AND codigo_error IS NULL AND mensaje_error IS NULL) OR (estado = 'no_concluyente' AND completado_en IS NOT NULL AND motivo_no_concluyente IS NOT NULL AND codigo_error IS NULL AND mensaje_error IS NULL) OR (estado = 'fallida' AND completado_en IS NOT NULL AND codigo_error IS NOT NULL AND mensaje_error IS NOT NULL AND motivo_no_concluyente IS NULL) OR estado IN ('pendiente', 'en_ejecucion'))",
            "recomendaciones_ia ADD CONSTRAINT recomendaciones_ia_tipo_check CHECK (tipo IN ('editorial', 'claridad', 'consistencia'))",
            "retroalimentacion_ia ADD CONSTRAINT retroalimentacion_ia_decision_check CHECK (decision IN ('aceptada', 'ignorada', 'no_util', 'aplicada'))",
            "retroalimentacion_ia ADD CONSTRAINT retroalimentacion_ia_aplicacion_check CHECK ((decision = 'aplicada' AND contenido_antes IS NOT NULL AND contenido_despues IS NOT NULL AND version_bloqueo_origen IS NOT NULL AND version_bloqueo_resultado = version_bloqueo_origen + 1) OR (decision <> 'aplicada' AND contenido_antes IS NULL AND contenido_despues IS NULL AND version_bloqueo_origen IS NULL AND version_bloqueo_resultado IS NULL))",
        ] as $sql) {
            DB::statement("ALTER TABLE {$sql}");
        }
    }

    private function soltarChecksEnEspanol(): void
    {
        foreach ([
            'versiones_malla_estado_check' => 'versiones_malla',
            'eventos_auditoria_resultado_check' => 'eventos_auditoria',
            'versiones_plantilla_estado_check' => 'versiones_plantilla',
            'bloques_plantilla_tipo_check' => 'bloques_plantilla',
            'definiciones_campo_tipo_check' => 'definiciones_campo',
            'campos_malla_tipo_check' => 'definiciones_campo_malla',
            'convocatorias_estado_check' => 'convocatorias',
            'convocatorias_agrupacion_check' => 'convocatorias',
            'fechas_limite_etapa_check' => 'fechas_limite_convocatoria',
            'silabos_estado_check' => 'silabos',
            'transiciones_silabo_accion_check' => 'transiciones_silabo',
            'transiciones_silabo_flujo_check' => 'transiciones_silabo',
            'ejecuciones_validacion_estado_check' => 'ejecuciones_validacion',
            'resultados_validacion_severidad_check' => 'resultados_validacion',
            'observaciones_revision_estado_check' => 'observaciones_revision',
            'objetos_almacenados_estado_check' => 'objetos_almacenados',
            'artefactos_exportacion_estado_check' => 'artefactos_exportacion',
            'artefactos_exportacion_completitud_check' => 'artefactos_exportacion',
            'eventos_salientes_estado_check' => 'eventos_salientes',
            'ejecuciones_trabajo_estado_check' => 'ejecuciones_trabajo',
            'ejecuciones_ia_estado_check' => 'ejecuciones_ia',
            'ejecuciones_ia_terminal_check' => 'ejecuciones_ia',
            'recomendaciones_ia_tipo_check' => 'recomendaciones_ia',
            'retroalimentacion_ia_decision_check' => 'retroalimentacion_ia',
            'retroalimentacion_ia_aplicacion_check' => 'retroalimentacion_ia',
        ] as $constraint => $tabla) {
            DB::statement("ALTER TABLE {$tabla} DROP CONSTRAINT {$constraint}");
        }
    }

    private function crearChecksOriginales(): void
    {
        foreach ([
            "versiones_malla ADD CONSTRAINT versiones_malla_estado_check CHECK (estado IN ('active', 'inactive', 'historical'))",
            "eventos_auditoria ADD CONSTRAINT eventos_auditoria_resultado_check CHECK (resultado IN ('success', 'denied', 'failed'))",
            "versiones_plantilla ADD CONSTRAINT versiones_plantilla_estado_check CHECK (estado IN ('draft', 'published'))",
            "bloques_plantilla ADD CONSTRAINT bloques_plantilla_tipo_check CHECK (tipo IN ('group', 'fields', 'repeatable', 'narrative', 'workflow'))",
            "definiciones_campo ADD CONSTRAINT definiciones_campo_tipo_check CHECK (tipo IN ('short_text', 'long_text', 'markdown', 'number', 'date', 'single_select', 'multi_select', 'boolean', 'repeatable', 'calculation', 'master_reference'))",
            "definiciones_campo_malla ADD CONSTRAINT campos_malla_tipo_check CHECK (tipo IN ('text', 'number', 'integer', 'boolean'))",
            "convocatorias ADD CONSTRAINT campanias_estado_check CHECK (estado IN ('preparation', 'open', 'closed'))",
            "convocatorias ADD CONSTRAINT campanias_agrupacion_check CHECK (modo_agrupacion IN ('per_offering', 'per_parallel'))",
            "fechas_limite_convocatoria ADD CONSTRAINT fechas_limite_etapa_check CHECK (etapa IN ('start', 'draft', 'review', 'correction'))",
            "silabos ADD CONSTRAINT silabos_estado_check CHECK (estado IN ('not_started', 'draft', 'in_review', 'correction_requested', 'approved'))",
            "transiciones_silabo ADD CONSTRAINT transiciones_silabo_accion_check CHECK (accion IN ('submit', 'request_correction', 'resubmit', 'approve', 'reopen'))",
            "transiciones_silabo ADD CONSTRAINT transiciones_silabo_flujo_check CHECK ((accion = 'submit' AND estado_origen = 'draft' AND estado_destino = 'in_review') OR (accion = 'request_correction' AND estado_origen = 'in_review' AND estado_destino = 'correction_requested') OR (accion = 'resubmit' AND estado_origen = 'correction_requested' AND estado_destino = 'in_review') OR (accion = 'approve' AND estado_origen = 'in_review' AND estado_destino = 'approved') OR (accion = 'reopen' AND estado_origen = 'approved' AND estado_destino = 'correction_requested'))",
            "ejecuciones_validacion ADD CONSTRAINT ejecuciones_validacion_estado_check CHECK (estado IN ('completed', 'failed'))",
            "resultados_validacion ADD CONSTRAINT resultados_validacion_severidad_check CHECK (severidad IN ('error', 'warning'))",
            "observaciones_revision ADD CONSTRAINT observaciones_revision_estado_check CHECK (estado IN ('open', 'responded', 'verified'))",
            "objetos_almacenados ADD CONSTRAINT objetos_almacenados_estado_check CHECK (estado IN ('active', 'quarantined'))",
            "artefactos_exportacion ADD CONSTRAINT artefactos_exportacion_estado_check CHECK (estado IN ('pending', 'running', 'completed', 'failed'))",
            "artefactos_exportacion ADD CONSTRAINT artefactos_exportacion_completitud_check CHECK ((estado = 'completed' AND objeto_docx_id IS NOT NULL AND objeto_pdf_id IS NOT NULL AND completado_en IS NOT NULL) OR estado <> 'completed')",
            "eventos_salientes ADD CONSTRAINT eventos_salientes_estado_check CHECK (estado IN ('pending', 'processing', 'processed', 'failed'))",
            "ejecuciones_trabajo ADD CONSTRAINT ejecuciones_trabajo_estado_check CHECK (estado IN ('pending', 'running', 'completed', 'failed'))",
            "ejecuciones_ia ADD CONSTRAINT ejecuciones_ia_estado_check CHECK (estado IN ('pending', 'running', 'completed', 'inconclusive', 'failed'))",
            "ejecuciones_ia ADD CONSTRAINT ejecuciones_ia_terminal_check CHECK ((estado = 'completed' AND version_pasarela_ejecutada IS NOT NULL AND completado_en IS NOT NULL AND motivo_no_concluyente IS NULL AND codigo_error IS NULL AND mensaje_error IS NULL) OR (estado = 'inconclusive' AND completado_en IS NOT NULL AND motivo_no_concluyente IS NOT NULL AND codigo_error IS NULL AND mensaje_error IS NULL) OR (estado = 'failed' AND completado_en IS NOT NULL AND codigo_error IS NOT NULL AND mensaje_error IS NOT NULL AND motivo_no_concluyente IS NULL) OR estado IN ('pending', 'running'))",
            "recomendaciones_ia ADD CONSTRAINT recomendaciones_ia_tipo_check CHECK (tipo IN ('editorial', 'clarity', 'consistency'))",
            "retroalimentacion_ia ADD CONSTRAINT retroalimentacion_ia_decision_check CHECK (decision IN ('accepted', 'ignored', 'not_useful', 'applied'))",
            "retroalimentacion_ia ADD CONSTRAINT retroalimentacion_ia_aplicacion_check CHECK ((decision = 'applied' AND contenido_antes IS NOT NULL AND contenido_despues IS NOT NULL AND version_bloqueo_origen IS NOT NULL AND version_bloqueo_resultado = version_bloqueo_origen + 1) OR (decision <> 'applied' AND contenido_antes IS NULL AND contenido_despues IS NULL AND version_bloqueo_origen IS NULL AND version_bloqueo_resultado IS NULL))",
        ] as $sql) {
            DB::statement("ALTER TABLE {$sql}");
        }
    }

    private function ajustarDefaults(bool $inverso): void
    {
        $defaults = [
            ['artefactos_exportacion', 'estado', 'pending', 'pendiente'],
            ['convocatorias', 'estado', 'preparation', 'preparacion'],
            ['ejecuciones_ia', 'estado', 'pending', 'pendiente'],
            ['ejecuciones_trabajo', 'estado', 'pending', 'pendiente'],
            ['ejecuciones_trabajo', 'cola', 'default', 'general'],
            ['eventos_salientes', 'estado', 'pending', 'pendiente'],
            ['objetos_almacenados', 'estado', 'active', 'activo'],
            ['observaciones_revision', 'estado', 'open', 'abierta'],
            ['requisitos_asignatura', 'tipo', 'prerequisite', 'prerrequisito'],
            ['silabos', 'estado', 'not_started', 'sin_iniciar'],
            ['versiones_plantilla', 'estado', 'draft', 'borrador'],
        ];

        foreach ($defaults as [$tabla, $columna, $ingles, $espanol]) {
            $valor = $inverso ? $ingles : $espanol;
            DB::statement("ALTER TABLE {$tabla} ALTER COLUMN {$columna} SET DEFAULT '{$valor}'");
        }

        // El default 'draft' de versiones_malla quedó inválido desde la migración 000018
        // (el CHECK vigente no lo admite): se elimina en lugar de traducirse.
        if ($inverso) {
            DB::statement("ALTER TABLE versiones_malla ALTER COLUMN estado SET DEFAULT 'draft'");
        } else {
            DB::statement('ALTER TABLE versiones_malla ALTER COLUMN estado DROP DEFAULT');
        }
    }

    private function recrearIndicesParciales(bool $inverso): void
    {
        DB::statement('DROP INDEX IF EXISTS ejecucion_ia_funcional_activa_unica');
        DB::statement('DROP INDEX IF EXISTS retroalimentacion_ia_aplicada_unica');

        if ($inverso) {
            DB::statement("CREATE UNIQUE INDEX ejecucion_ia_funcional_activa_unica ON ejecuciones_ia (silabo_id, definicion_campo_id, clave_funcional) WHERE estado IN ('pending', 'running', 'completed', 'inconclusive')");
            DB::statement("CREATE UNIQUE INDEX retroalimentacion_ia_aplicada_unica ON retroalimentacion_ia (recomendacion_ia_id) WHERE decision = 'applied'");

            return;
        }

        DB::statement("CREATE UNIQUE INDEX ejecucion_ia_funcional_activa_unica ON ejecuciones_ia (silabo_id, definicion_campo_id, clave_funcional) WHERE estado IN ('pendiente', 'en_ejecucion', 'completada', 'no_concluyente')");
        DB::statement("CREATE UNIQUE INDEX retroalimentacion_ia_aplicada_unica ON retroalimentacion_ia (recomendacion_ia_id) WHERE decision = 'aplicada'");
    }

    private function redefinirFuncionesConValoresEnEspanol(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION validar_artefacto_exportacion() RETURNS trigger AS $$
            DECLARE
                silabo_revision uuid;
                plantilla_silabo uuid;
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Un artefacto de exportación no puede eliminarse' USING ERRCODE = '23514';
                END IF;
                SELECT r.silabo_id, s.version_plantilla_id
                INTO silabo_revision, plantilla_silabo
                FROM revisiones_silabo r
                JOIN silabos s ON s.id = r.silabo_id
                WHERE r.id = NEW.revision_silabo_id;
                IF silabo_revision IS DISTINCT FROM NEW.silabo_id
                   OR plantilla_silabo IS DISTINCT FROM NEW.version_plantilla_id THEN
                    RAISE EXCEPTION 'El artefacto no coincide con la revisión y plantilla del sílabo' USING ERRCODE = '23514';
                END IF;
                IF TG_OP = 'UPDATE' AND OLD.estado = 'completado' AND NEW IS DISTINCT FROM OLD THEN
                    RAISE EXCEPTION 'Un artefacto completado es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION proteger_configuracion_publicada() RETURNS trigger AS $$
            DECLARE estado_version text;
            BEGIN
                IF TG_TABLE_NAME = 'versiones_plantilla' THEN
                    estado_version := OLD.estado;
                ELSE
                    SELECT estado INTO estado_version FROM versiones_plantilla
                    WHERE id = COALESCE(OLD.version_plantilla_id, NEW.version_plantilla_id);
                END IF;

                IF estado_version = 'publicada' THEN
                    RAISE EXCEPTION 'La versión de plantilla publicada es inmutable' USING ERRCODE = '23514';
                END IF;

                RETURN COALESCE(NEW, OLD);
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_evidencia_ia() RETURNS trigger AS $$
            DECLARE
                carrera_fuente uuid;
                carrera_silabo uuid;
                fuente_activa boolean;
                convocatoria_silabo uuid;
                estado_ejecucion text;
            BEGIN
                SELECT activo, carrera_id INTO fuente_activa, carrera_fuente
                FROM fuentes_academicas WHERE id = NEW.fuente_academica_id;
                SELECT s.convocatoria_id, c.carrera_id, e.estado
                INTO convocatoria_silabo, carrera_silabo, estado_ejecucion
                FROM ejecuciones_ia e
                JOIN silabos s ON s.id = e.silabo_id
                JOIN convocatorias c ON c.id = s.convocatoria_id
                WHERE e.id = NEW.ejecucion_ia_id;

                IF carrera_fuente IS DISTINCT FROM carrera_silabo
                   OR fuente_activa IS DISTINCT FROM TRUE
                   OR estado_ejecucion IS DISTINCT FROM 'pendiente'
                   OR NOT EXISTS (
                       SELECT 1 FROM fuentes_convocatoria
                       WHERE convocatoria_id = convocatoria_silabo
                         AND fuente_academica_id = NEW.fuente_academica_id
                   ) THEN
                    RAISE EXCEPTION 'La evidencia debe citar una fuente activa fijada por la convocatoria' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_recomendacion_ia() RETURNS trigger AS $$
            DECLARE campo_ejecucion uuid;
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT definicion_campo_id, estado INTO campo_ejecucion, estado_ejecucion
                FROM ejecuciones_ia WHERE id = NEW.ejecucion_ia_id;
                IF campo_ejecucion IS DISTINCT FROM NEW.definicion_campo_id
                   OR estado_ejecucion IS DISTINCT FROM 'en_ejecucion' THEN
                    RAISE EXCEPTION 'La recomendación no corresponde al campo analizado' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_recomendacion_evidencia_ia() RETURNS trigger AS $$
            DECLARE ejecucion_recomendacion uuid;
            DECLARE ejecucion_evidencia uuid;
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT r.ejecucion_ia_id, e.estado
                INTO ejecucion_recomendacion, estado_ejecucion
                FROM recomendaciones_ia r
                JOIN ejecuciones_ia e ON e.id = r.ejecucion_ia_id
                WHERE r.id = NEW.recomendacion_ia_id;
                SELECT ejecucion_ia_id INTO ejecucion_evidencia
                FROM evidencias_ia WHERE id = NEW.evidencia_ia_id;
                IF ejecucion_recomendacion IS DISTINCT FROM ejecucion_evidencia
                   OR estado_ejecucion IS DISTINCT FROM 'en_ejecucion' THEN
                    RAISE EXCEPTION 'La recomendación y evidencia pertenecen a ejecuciones distintas' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_retroalimentacion_ia() RETURNS trigger AS $$
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT e.estado INTO estado_ejecucion
                FROM recomendaciones_ia r
                JOIN ejecuciones_ia e ON e.id = r.ejecucion_ia_id
                WHERE r.id = NEW.recomendacion_ia_id;
                IF estado_ejecucion IS DISTINCT FROM 'completada' THEN
                    RAISE EXCEPTION 'Solo una recomendación completada admite decisión humana' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_ejecucion_ia() RETURNS trigger AS $$
            DECLARE
                plantilla_silabo uuid;
                plantilla_campo uuid;
            BEGIN
                SELECT version_plantilla_id INTO plantilla_silabo
                FROM silabos WHERE id = NEW.silabo_id;
                SELECT version_plantilla_id INTO plantilla_campo
                FROM definiciones_campo WHERE id = NEW.definicion_campo_id;

                IF plantilla_silabo IS DISTINCT FROM NEW.version_plantilla_id
                   OR plantilla_campo IS DISTINCT FROM NEW.version_plantilla_id THEN
                    RAISE EXCEPTION 'La ejecución de IA no coincide con la plantilla y campo del sílabo' USING ERRCODE = '23514';
                END IF;

                IF TG_OP = 'UPDATE' THEN
                    IF OLD.estado IN ('completada', 'no_concluyente', 'fallida') THEN
                        RAISE EXCEPTION 'Una ejecución de IA terminal es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF NEW.id IS DISTINCT FROM OLD.id
                       OR NEW.silabo_id IS DISTINCT FROM OLD.silabo_id
                       OR NEW.definicion_campo_id IS DISTINCT FROM OLD.definicion_campo_id
                       OR NEW.version_plantilla_id IS DISTINCT FROM OLD.version_plantilla_id
                       OR NEW.clave_idempotencia IS DISTINCT FROM OLD.clave_idempotencia
                       OR NEW.clave_funcional IS DISTINCT FROM OLD.clave_funcional
                       OR NEW.version_contrato IS DISTINCT FROM OLD.version_contrato
                       OR NEW.version_instruccion IS DISTINCT FROM OLD.version_instruccion
                       OR NEW.version_pasarela_solicitada IS DISTINCT FROM OLD.version_pasarela_solicitada
                       OR NEW.idioma IS DISTINCT FROM OLD.idioma
                       OR NEW.contenido_entrada IS DISTINCT FROM OLD.contenido_entrada
                       OR NEW.huella_contenido IS DISTINCT FROM OLD.huella_contenido
                       OR NEW.huella_conjunto_fuentes IS DISTINCT FROM OLD.huella_conjunto_fuentes
                       OR NEW.metadatos_entrada IS DISTINCT FROM OLD.metadatos_entrada
                       OR NEW.version_bloqueo_origen IS DISTINCT FROM OLD.version_bloqueo_origen
                       OR NEW.solicitado_por IS DISTINCT FROM OLD.solicitado_por
                       OR NEW.asignacion_rol_id IS DISTINCT FROM OLD.asignacion_rol_id
                       OR NEW.solicitado_en IS DISTINCT FROM OLD.solicitado_en THEN
                        RAISE EXCEPTION 'La entrada fijada de una ejecución de IA es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF OLD.ejecucion_trabajo_id IS NOT NULL
                       AND NEW.ejecucion_trabajo_id IS DISTINCT FROM OLD.ejecucion_trabajo_id THEN
                        RAISE EXCEPTION 'El trabajo asociado a la ejecución de IA es inmutable' USING ERRCODE = '23514';
                    END IF;
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            SQL);
    }

    private function restaurarFuncionesConValoresEnIngles(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION validar_artefacto_exportacion() RETURNS trigger AS $$
            DECLARE
                silabo_revision uuid;
                plantilla_silabo uuid;
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Un artefacto de exportación no puede eliminarse' USING ERRCODE = '23514';
                END IF;
                SELECT r.silabo_id, s.version_plantilla_id
                INTO silabo_revision, plantilla_silabo
                FROM revisiones_silabo r
                JOIN silabos s ON s.id = r.silabo_id
                WHERE r.id = NEW.revision_silabo_id;
                IF silabo_revision IS DISTINCT FROM NEW.silabo_id
                   OR plantilla_silabo IS DISTINCT FROM NEW.version_plantilla_id THEN
                    RAISE EXCEPTION 'El artefacto no coincide con la revisión y plantilla del sílabo' USING ERRCODE = '23514';
                END IF;
                IF TG_OP = 'UPDATE' AND OLD.estado = 'completed' AND NEW IS DISTINCT FROM OLD THEN
                    RAISE EXCEPTION 'Un artefacto completado es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION proteger_configuracion_publicada() RETURNS trigger AS $$
            DECLARE estado_version text;
            BEGIN
                IF TG_TABLE_NAME = 'versiones_plantilla' THEN
                    estado_version := OLD.estado;
                ELSE
                    SELECT estado INTO estado_version FROM versiones_plantilla
                    WHERE id = COALESCE(OLD.version_plantilla_id, NEW.version_plantilla_id);
                END IF;

                IF estado_version = 'published' THEN
                    RAISE EXCEPTION 'La versión de plantilla publicada es inmutable' USING ERRCODE = '23514';
                END IF;

                RETURN COALESCE(NEW, OLD);
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_evidencia_ia() RETURNS trigger AS $$
            DECLARE
                carrera_fuente uuid;
                carrera_silabo uuid;
                fuente_activa boolean;
                convocatoria_silabo uuid;
                estado_ejecucion text;
            BEGIN
                SELECT activo, carrera_id INTO fuente_activa, carrera_fuente
                FROM fuentes_academicas WHERE id = NEW.fuente_academica_id;
                SELECT s.convocatoria_id, c.carrera_id, e.estado
                INTO convocatoria_silabo, carrera_silabo, estado_ejecucion
                FROM ejecuciones_ia e
                JOIN silabos s ON s.id = e.silabo_id
                JOIN convocatorias c ON c.id = s.convocatoria_id
                WHERE e.id = NEW.ejecucion_ia_id;

                IF carrera_fuente IS DISTINCT FROM carrera_silabo
                   OR fuente_activa IS DISTINCT FROM TRUE
                   OR estado_ejecucion IS DISTINCT FROM 'pending'
                   OR NOT EXISTS (
                       SELECT 1 FROM fuentes_convocatoria
                       WHERE convocatoria_id = convocatoria_silabo
                         AND fuente_academica_id = NEW.fuente_academica_id
                   ) THEN
                    RAISE EXCEPTION 'La evidencia debe citar una fuente activa fijada por la convocatoria' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_recomendacion_ia() RETURNS trigger AS $$
            DECLARE campo_ejecucion uuid;
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT definicion_campo_id, estado INTO campo_ejecucion, estado_ejecucion
                FROM ejecuciones_ia WHERE id = NEW.ejecucion_ia_id;
                IF campo_ejecucion IS DISTINCT FROM NEW.definicion_campo_id
                   OR estado_ejecucion IS DISTINCT FROM 'running' THEN
                    RAISE EXCEPTION 'La recomendación no corresponde al campo analizado' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_recomendacion_evidencia_ia() RETURNS trigger AS $$
            DECLARE ejecucion_recomendacion uuid;
            DECLARE ejecucion_evidencia uuid;
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT r.ejecucion_ia_id, e.estado
                INTO ejecucion_recomendacion, estado_ejecucion
                FROM recomendaciones_ia r
                JOIN ejecuciones_ia e ON e.id = r.ejecucion_ia_id
                WHERE r.id = NEW.recomendacion_ia_id;
                SELECT ejecucion_ia_id INTO ejecucion_evidencia
                FROM evidencias_ia WHERE id = NEW.evidencia_ia_id;
                IF ejecucion_recomendacion IS DISTINCT FROM ejecucion_evidencia
                   OR estado_ejecucion IS DISTINCT FROM 'running' THEN
                    RAISE EXCEPTION 'La recomendación y evidencia pertenecen a ejecuciones distintas' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_retroalimentacion_ia() RETURNS trigger AS $$
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT e.estado INTO estado_ejecucion
                FROM recomendaciones_ia r
                JOIN ejecuciones_ia e ON e.id = r.ejecucion_ia_id
                WHERE r.id = NEW.recomendacion_ia_id;
                IF estado_ejecucion IS DISTINCT FROM 'completed' THEN
                    RAISE EXCEPTION 'Solo una recomendación completada admite decisión humana' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_ejecucion_ia() RETURNS trigger AS $$
            DECLARE
                plantilla_silabo uuid;
                plantilla_campo uuid;
            BEGIN
                SELECT version_plantilla_id INTO plantilla_silabo
                FROM silabos WHERE id = NEW.silabo_id;
                SELECT version_plantilla_id INTO plantilla_campo
                FROM definiciones_campo WHERE id = NEW.definicion_campo_id;

                IF plantilla_silabo IS DISTINCT FROM NEW.version_plantilla_id
                   OR plantilla_campo IS DISTINCT FROM NEW.version_plantilla_id THEN
                    RAISE EXCEPTION 'La ejecución de IA no coincide con la plantilla y campo del sílabo' USING ERRCODE = '23514';
                END IF;

                IF TG_OP = 'UPDATE' THEN
                    IF OLD.estado IN ('completed', 'inconclusive', 'failed') THEN
                        RAISE EXCEPTION 'Una ejecución de IA terminal es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF NEW.id IS DISTINCT FROM OLD.id
                       OR NEW.silabo_id IS DISTINCT FROM OLD.silabo_id
                       OR NEW.definicion_campo_id IS DISTINCT FROM OLD.definicion_campo_id
                       OR NEW.version_plantilla_id IS DISTINCT FROM OLD.version_plantilla_id
                       OR NEW.clave_idempotencia IS DISTINCT FROM OLD.clave_idempotencia
                       OR NEW.clave_funcional IS DISTINCT FROM OLD.clave_funcional
                       OR NEW.version_contrato IS DISTINCT FROM OLD.version_contrato
                       OR NEW.version_instruccion IS DISTINCT FROM OLD.version_instruccion
                       OR NEW.version_pasarela_solicitada IS DISTINCT FROM OLD.version_pasarela_solicitada
                       OR NEW.idioma IS DISTINCT FROM OLD.idioma
                       OR NEW.contenido_entrada IS DISTINCT FROM OLD.contenido_entrada
                       OR NEW.huella_contenido IS DISTINCT FROM OLD.huella_contenido
                       OR NEW.huella_conjunto_fuentes IS DISTINCT FROM OLD.huella_conjunto_fuentes
                       OR NEW.metadatos_entrada IS DISTINCT FROM OLD.metadatos_entrada
                       OR NEW.version_bloqueo_origen IS DISTINCT FROM OLD.version_bloqueo_origen
                       OR NEW.solicitado_por IS DISTINCT FROM OLD.solicitado_por
                       OR NEW.asignacion_rol_id IS DISTINCT FROM OLD.asignacion_rol_id
                       OR NEW.solicitado_en IS DISTINCT FROM OLD.solicitado_en THEN
                        RAISE EXCEPTION 'La entrada fijada de una ejecución de IA es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF OLD.ejecucion_trabajo_id IS NOT NULL
                       AND NEW.ejecucion_trabajo_id IS DISTINCT FROM OLD.ejecucion_trabajo_id THEN
                        RAISE EXCEPTION 'El trabajo asociado a la ejecución de IA es inmutable' USING ERRCODE = '23514';
                    END IF;
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            SQL);
    }
};
