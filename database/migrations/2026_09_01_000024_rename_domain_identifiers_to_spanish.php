<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Renombra a español todos los identificadores en inglés de las tablas propias (I-28):
 * timestamps de Eloquent, columnas de `ejecuciones_trabajo`, familia `lock_version`,
 * `snapshot`, `locale`, `gateway`/`renderer`, `correlation_id`, y la tabla
 * `eventos_outbox` → `eventos_salientes` con `payload` → `contenido`.
 *
 * Reglas aplicadas:
 * - `created_at`/`updated_at` → `creado_en`/`actualizado_en`.
 * - Donde `creado_en` ya existe como marca de dominio (`notificaciones_internas`,
 *   `objetos_almacenados`, `observaciones_revision`), el `created_at` de Eloquent pasa a
 *   `registrado_en` (momento de inserción de la fila); no se elimina ninguna columna.
 * - `ALTER TABLE … RENAME COLUMN` actualiza índices y constraints pero NO los cuerpos de
 *   funciones PL/pgSQL (precedente I-14): `proteger_payload_outbox()` y
 *   `validar_ejecucion_ia()` se redefinen aquí mismo. Los valores de estado siguen en
 *   inglés hasta la migración 000025.
 */
return new class extends Migration
{
    /** Tablas con el par completo created_at/updated_at → creado_en/actualizado_en. */
    private const PARES = [
        'roles', 'facultades', 'escuelas', 'campus', 'modalidades', 'periodos_academicos',
        'carreras', 'asignaciones_rol', 'asignaciones_coordinador', 'asignaciones_docente',
        'versiones_malla', 'asignaturas', 'requisitos_asignatura', 'ofertas_academicas',
        'paralelos', 'definiciones_campo_malla', 'valores_campo_asignatura',
        'plantillas_silabo', 'versiones_plantilla', 'secciones_plantilla',
        'bloques_plantilla', 'definiciones_campo', 'fuentes_academicas', 'convocatorias',
        'fuentes_convocatoria', 'fechas_limite_convocatoria', 'silabos', 'alcances_silabo',
        'colaboradores_silabo', 'valores_campo', 'filas_repetibles',
        'ejecuciones_validacion', 'resultados_validacion', 'revisiones_silabo',
        'solicitudes_correccion', 'respuestas_observacion', 'aprobaciones', 'reaperturas',
        'artefactos_exportacion', 'ejecuciones_trabajo', 'ejecuciones_ia',
        'eventos_salientes',
    ];

    /** Tablas donde `creado_en` de dominio ya existe: created_at → registrado_en. */
    private const REGISTRADO_CON_ACTUALIZADO = ['objetos_almacenados', 'observaciones_revision'];

    private const REGISTRADO_SOLO = ['notificaciones_internas'];

    /** Tablas append-only con solo created_at y sin colisión: → creado_en. */
    private const CREADO_SOLO = [
        'eventos_auditoria', 'transiciones_silabo', 'solicitud_correccion_observaciones',
        'evidencias_ia', 'recomendaciones_ia', 'recomendacion_evidencias_ia',
        'retroalimentacion_ia',
    ];

    /** Renombres de columnas de dominio adicionales, por tabla. */
    private const COLUMNAS = [
        'ejecuciones_trabajo' => [
            'type' => 'tipo',
            'status' => 'estado',
            'idempotency_key' => 'clave_idempotencia',
            'correlation_id' => 'correlacion_id',
            'attempts' => 'intentos',
            'max_attempts' => 'intentos_maximos',
            'progress' => 'progreso',
            'result' => 'resultado',
            'error_code' => 'codigo_error',
            'error_message' => 'mensaje_error',
            'started_at' => 'iniciado_en',
            'finished_at' => 'finalizado_en',
            'queue_name' => 'cola',
            'resource_type' => 'tipo_recurso',
            'resource_id' => 'recurso_id',
        ],
        'eventos_salientes' => ['payload' => 'contenido'],
        'eventos_auditoria' => ['correlation_id' => 'correlacion_id'],
        'silabos' => ['lock_version' => 'version_bloqueo'],
        'ejecuciones_validacion' => ['lock_version' => 'version_bloqueo'],
        'revisiones_silabo' => [
            'lock_version_origen' => 'version_bloqueo_origen',
            'snapshot' => 'fotografia',
        ],
        'ejecuciones_ia' => [
            'lock_version_origen' => 'version_bloqueo_origen',
            'locale' => 'idioma',
            'version_gateway_solicitada' => 'version_pasarela_solicitada',
            'version_gateway_ejecutada' => 'version_pasarela_ejecutada',
        ],
        'retroalimentacion_ia' => [
            'lock_version_origen' => 'version_bloqueo_origen',
            'lock_version_resultado' => 'version_bloqueo_resultado',
        ],
        'artefactos_exportacion' => [
            'locale' => 'idioma',
            'version_renderer' => 'version_renderizador',
        ],
    ];

    /** Índices y constraints cuyo nombre arrastra columnas o tabla renombradas. */
    private const INDICES = [
        'eventos_outbox_pkey' => 'eventos_salientes_pkey',
        'eventos_outbox_clave_deduplicacion_unique' => 'eventos_salientes_clave_deduplicacion_unique',
        'eventos_outbox_estado_disponible_en_index' => 'eventos_salientes_estado_disponible_en_index',
        'eventos_outbox_tipo_agregado_agregado_id_ocurrido_en_index' => 'eventos_salientes_tipo_agregado_agregado_id_ocurrido_en_index',
        'ejecuciones_trabajo_idempotency_key_unique' => 'ejecuciones_trabajo_clave_idempotencia_unique',
        'ejecuciones_trabajo_correlation_id_index' => 'ejecuciones_trabajo_correlacion_id_index',
        'ejecuciones_trabajo_status_created_at_index' => 'ejecuciones_trabajo_estado_creado_en_index',
        'ejecuciones_trabajo_queue_name_status_created_at_index' => 'ejecuciones_trabajo_cola_estado_creado_en_index',
        'ejecuciones_trabajo_resource_type_resource_id_index' => 'ejecuciones_trabajo_tipo_recurso_recurso_id_index',
        'eventos_auditoria_correlation_id_index' => 'eventos_auditoria_correlacion_id_index',
    ];

    public function up(): void
    {
        DB::statement('ALTER TABLE eventos_outbox RENAME TO eventos_salientes');
        DB::statement('ALTER TABLE eventos_salientes RENAME CONSTRAINT eventos_outbox_estado_check TO eventos_salientes_estado_check');

        foreach (self::PARES as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN created_at TO creado_en");
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN updated_at TO actualizado_en");
        }

        foreach (self::REGISTRADO_CON_ACTUALIZADO as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN created_at TO registrado_en");
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN updated_at TO actualizado_en");
        }

        foreach (self::REGISTRADO_SOLO as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN created_at TO registrado_en");
        }

        foreach (self::CREADO_SOLO as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN created_at TO creado_en");
        }

        foreach (self::COLUMNAS as $tabla => $renombres) {
            foreach ($renombres as $anterior => $nuevo) {
                DB::statement("ALTER TABLE {$tabla} RENAME COLUMN {$anterior} TO {$nuevo}");
            }
        }

        foreach (self::INDICES as $anterior => $nuevo) {
            DB::statement("ALTER INDEX {$anterior} RENAME TO {$nuevo}");
        }

        $this->redefinirFuncionesConColumnasNuevas();
    }

    /**
     * Los cuerpos PL/pgSQL conservan los nombres antiguos tras el RENAME; sin esta
     * redefinición, el trigger del outbox y el de ejecuciones de IA fallarían en
     * ejecución («record NEW has no field payload»), no al migrar.
     */
    private function redefinirFuncionesConColumnasNuevas(): void
    {
        DB::unprepared(<<<'SQL'
            DROP TRIGGER proteger_evento_outbox ON eventos_salientes;
            DROP FUNCTION proteger_payload_outbox();

            CREATE FUNCTION proteger_contenido_evento_saliente() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.tipo_agregado IS DISTINCT FROM OLD.tipo_agregado
                   OR NEW.agregado_id IS DISTINCT FROM OLD.agregado_id
                   OR NEW.tipo_evento IS DISTINCT FROM OLD.tipo_evento
                   OR NEW.clave_deduplicacion IS DISTINCT FROM OLD.clave_deduplicacion
                   OR NEW.contenido IS DISTINCT FROM OLD.contenido
                   OR NEW.ocurrido_en IS DISTINCT FROM OLD.ocurrido_en THEN
                    RAISE EXCEPTION 'La identidad y contenido del evento saliente son inmutables' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_evento_saliente
            BEFORE UPDATE OR DELETE ON eventos_salientes
            FOR EACH ROW EXECUTE FUNCTION proteger_contenido_evento_saliente();

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

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            DROP TRIGGER proteger_evento_saliente ON eventos_salientes;
            DROP FUNCTION proteger_contenido_evento_saliente();

            CREATE FUNCTION proteger_payload_outbox() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.tipo_agregado IS DISTINCT FROM OLD.tipo_agregado
                   OR NEW.agregado_id IS DISTINCT FROM OLD.agregado_id
                   OR NEW.tipo_evento IS DISTINCT FROM OLD.tipo_evento
                   OR NEW.clave_deduplicacion IS DISTINCT FROM OLD.clave_deduplicacion
                   OR NEW.payload IS DISTINCT FROM OLD.payload
                   OR NEW.ocurrido_en IS DISTINCT FROM OLD.ocurrido_en THEN
                    RAISE EXCEPTION 'La identidad y payload del outbox son inmutables' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_evento_outbox
            BEFORE UPDATE OR DELETE ON eventos_salientes
            FOR EACH ROW EXECUTE FUNCTION proteger_payload_outbox();

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
                       OR NEW.version_gateway_solicitada IS DISTINCT FROM OLD.version_gateway_solicitada
                       OR NEW.locale IS DISTINCT FROM OLD.locale
                       OR NEW.contenido_entrada IS DISTINCT FROM OLD.contenido_entrada
                       OR NEW.huella_contenido IS DISTINCT FROM OLD.huella_contenido
                       OR NEW.huella_conjunto_fuentes IS DISTINCT FROM OLD.huella_conjunto_fuentes
                       OR NEW.metadatos_entrada IS DISTINCT FROM OLD.metadatos_entrada
                       OR NEW.lock_version_origen IS DISTINCT FROM OLD.lock_version_origen
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

        foreach (array_flip(self::INDICES) as $nuevo => $anterior) {
            DB::statement("ALTER INDEX {$nuevo} RENAME TO {$anterior}");
        }

        foreach (self::COLUMNAS as $tabla => $renombres) {
            foreach (array_flip($renombres) as $nuevo => $anterior) {
                DB::statement("ALTER TABLE {$tabla} RENAME COLUMN {$nuevo} TO {$anterior}");
            }
        }

        foreach (self::CREADO_SOLO as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN creado_en TO created_at");
        }

        foreach (self::REGISTRADO_SOLO as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN registrado_en TO created_at");
        }

        foreach (self::REGISTRADO_CON_ACTUALIZADO as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN actualizado_en TO updated_at");
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN registrado_en TO created_at");
        }

        foreach (self::PARES as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN actualizado_en TO updated_at");
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN creado_en TO created_at");
        }

        DB::statement('ALTER TABLE eventos_salientes RENAME CONSTRAINT eventos_salientes_estado_check TO eventos_outbox_estado_check');
        DB::statement('ALTER TABLE eventos_salientes RENAME TO eventos_outbox');
    }
};
