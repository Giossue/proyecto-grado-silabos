<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $domainDates = [
            'asignaciones_docente' => ['creado_en', 'asignado_en'],
            'asignaciones_rol' => ['creado_en', 'asignado_en'],
            'ejecuciones_trabajo' => ['creado_en', 'encolado_en'],
            'notificaciones_internas' => ['creado_en', 'notificado_en'],
            'objetos_almacenados' => ['creado_en', 'almacenado_en'],
            'observaciones_revision' => ['creado_en', 'observado_en'],
        ];

        foreach ($domainDates as $table => [$from, $to]) {
            Schema::table($table, function (Blueprint $blueprint) use ($from, $to): void {
                $blueprint->renameColumn($from, $to);
            });
        }

        $auditColumns = [
            'alcances_silabo' => ['creado_en', 'actualizado_en'],
            'aprobaciones' => ['creado_en', 'actualizado_en'],
            'artefactos_exportacion' => ['creado_en', 'actualizado_en'],
            'asignaciones_coordinador' => ['creado_en', 'actualizado_en'],
            'asignaciones_docente' => ['actualizado_en'],
            'asignaciones_rol' => ['actualizado_en'],
            'asignaturas' => ['creado_en', 'actualizado_en'],
            'bloques_plantilla' => ['creado_en', 'actualizado_en'],
            'campus' => ['creado_en', 'actualizado_en'],
            'carreras' => ['creado_en', 'actualizado_en'],
            'colaboradores_silabo' => ['creado_en', 'actualizado_en'],
            'convocatorias_carreras' => ['creado_en'],
            'convocatorias_universidad' => ['creado_en'],
            'definiciones_campo' => ['creado_en', 'actualizado_en'],
            'definiciones_campo_malla' => ['creado_en', 'actualizado_en'],
            'ejecuciones_ia' => ['creado_en', 'actualizado_en'],
            'ejecuciones_trabajo' => ['actualizado_en'],
            'ejecuciones_validacion' => ['creado_en', 'actualizado_en'],
            'eventos_auditoria' => ['creado_en'],
            'eventos_salientes' => ['creado_en', 'actualizado_en'],
            'evidencias_ia' => ['creado_en'],
            'facultades' => ['creado_en', 'actualizado_en'],
            'fechas_limite_convocatoria' => ['creado_en', 'actualizado_en'],
            'filas_repetibles' => ['creado_en', 'actualizado_en'],
            'fuentes_academicas' => ['creado_en', 'actualizado_en'],
            'fuentes_convocatoria' => ['creado_en', 'actualizado_en'],
            'mallas' => ['creado_en', 'actualizado_en'],
            'notificaciones_internas' => ['registrado_en'],
            'objetos_almacenados' => ['registrado_en', 'actualizado_en'],
            'observaciones_revision' => ['registrado_en', 'actualizado_en'],
            'ofertas_academicas' => ['creado_en', 'actualizado_en'],
            'paralelos' => ['creado_en', 'actualizado_en'],
            'periodos_academicos' => ['creado_en', 'actualizado_en'],
            'plantillas_silabo' => ['creado_en', 'actualizado_en'],
            'reaperturas' => ['creado_en', 'actualizado_en'],
            'recomendacion_evidencias_ia' => ['creado_en'],
            'recomendaciones_ia' => ['creado_en'],
            'requisitos_asignatura' => ['creado_en', 'actualizado_en'],
            'respuestas_observacion' => ['creado_en', 'actualizado_en'],
            'resultados_validacion' => ['creado_en', 'actualizado_en'],
            'retroalimentacion_ia' => ['creado_en'],
            'revisiones_silabo' => ['creado_en', 'actualizado_en'],
            'roles' => ['creado_en', 'actualizado_en'],
            'secciones_plantilla' => ['creado_en', 'actualizado_en'],
            'silabos' => ['creado_en', 'actualizado_en'],
            'solicitud_correccion_observaciones' => ['creado_en'],
            'solicitudes_correccion' => ['creado_en', 'actualizado_en'],
            'transiciones_silabo' => ['creado_en'],
            'usuarios' => ['creado_en'],
            'valores_campo' => ['creado_en', 'actualizado_en'],
            'valores_campo_asignatura' => ['creado_en', 'actualizado_en'],
        ];

        foreach ($auditColumns as $table => $columns) {
            Schema::table($table, function (Blueprint $blueprint) use ($columns): void {
                $blueprint->dropColumn($columns);
            });
        }

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION proteger_notificacion_interna() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
                   OR NEW.clave_deduplicacion IS DISTINCT FROM OLD.clave_deduplicacion
                   OR NEW.tipo IS DISTINCT FROM OLD.tipo
                   OR NEW.titulo IS DISTINCT FROM OLD.titulo
                   OR NEW.mensaje IS DISTINCT FROM OLD.mensaje
                   OR NEW.tipo_recurso IS DISTINCT FROM OLD.tipo_recurso
                   OR NEW.recurso_id IS DISTINCT FROM OLD.recurso_id
                   OR NEW.notificado_en IS DISTINCT FROM OLD.notificado_en THEN
                    RAISE EXCEPTION 'El contenido de la notificación es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION proteger_contenido_observacion() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.revision_silabo_id IS DISTINCT FROM OLD.revision_silabo_id
                   OR NEW.clave_seccion IS DISTINCT FROM OLD.clave_seccion
                   OR NEW.clave_campo IS DISTINCT FROM OLD.clave_campo
                   OR NEW.contenido IS DISTINCT FROM OLD.contenido
                   OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
                   OR NEW.observado_en IS DISTINCT FROM OLD.observado_en THEN
                    RAISE EXCEPTION 'El contenido de la observación es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            SQL);

        DB::statement('ALTER INDEX IF EXISTS ejecuciones_trabajo_cola_estado_creado_en_index RENAME TO ejecuciones_trabajo_cola_estado_encolado_en_index');
        DB::statement('ALTER INDEX IF EXISTS ejecuciones_trabajo_estado_creado_en_index RENAME TO ejecuciones_trabajo_estado_encolado_en_index');
        DB::statement('ALTER INDEX IF EXISTS notificaciones_internas_usuario_id_leido_en_creado_en_index RENAME TO notificaciones_internas_usuario_leido_notificado_index');
        DB::statement('ALTER INDEX IF EXISTS objetos_almacenados_clasificacion_estado_creado_en_index RENAME TO objetos_almacenados_clasificacion_estado_almacenado_index');
    }

    public function down(): void
    {
        throw new RuntimeException('I-52 elimina metadatos de auditoría y no admite reversión automática. Restaure el respaldo previo.');
    }
};
