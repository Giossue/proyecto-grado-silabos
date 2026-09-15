<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->renameColumns(true);
        $this->defineIntegrityFunctions(true);
    }

    public function down(): void
    {
        $this->renameColumns(false);
        $this->defineIntegrityFunctions(false);
    }

    private function renameColumns(bool $toExplicit): void
    {
        $columns = $toExplicit
            ? [
                'objetos_almacenados' => ['estado' => 'estado_objeto_almacenado'],
                'artefactos_exportacion' => ['estado' => 'estado_artefacto_exportacion'],
                'notificaciones_internas' => [
                    'tipo' => 'tipo_notificacion_interna',
                    'titulo' => 'titulo_notificacion_interna',
                    'mensaje' => 'mensaje_notificacion_interna',
                ],
                'eventos_auditoria' => [
                    'accion' => 'accion_evento_auditoria',
                    'resultado' => 'resultado_evento_auditoria',
                    'metadatos' => 'metadatos_evento_auditoria',
                ],
                'eventos_salientes' => [
                    'contenido' => 'contenido_evento_saliente',
                    'estado' => 'estado_evento_saliente',
                ],
                'ejecuciones_trabajo' => [
                    'tipo' => 'tipo_ejecucion_trabajo',
                    'estado' => 'estado_ejecucion_trabajo',
                    'resultado' => 'resultado_ejecucion_trabajo',
                ],
            ]
            : [
                'objetos_almacenados' => ['estado_objeto_almacenado' => 'estado'],
                'artefactos_exportacion' => ['estado_artefacto_exportacion' => 'estado'],
                'notificaciones_internas' => [
                    'tipo_notificacion_interna' => 'tipo',
                    'titulo_notificacion_interna' => 'titulo',
                    'mensaje_notificacion_interna' => 'mensaje',
                ],
                'eventos_auditoria' => [
                    'accion_evento_auditoria' => 'accion',
                    'resultado_evento_auditoria' => 'resultado',
                    'metadatos_evento_auditoria' => 'metadatos',
                ],
                'eventos_salientes' => [
                    'contenido_evento_saliente' => 'contenido',
                    'estado_evento_saliente' => 'estado',
                ],
                'ejecuciones_trabajo' => [
                    'tipo_ejecucion_trabajo' => 'tipo',
                    'estado_ejecucion_trabajo' => 'estado',
                    'resultado_ejecucion_trabajo' => 'resultado',
                ],
            ];

        foreach ($columns as $table => $renames) {
            Schema::table($table, function (Blueprint $blueprint) use ($renames): void {
                foreach ($renames as $from => $to) {
                    $blueprint->renameColumn($from, $to);
                }
            });
        }
    }

    private function defineIntegrityFunctions(bool $explicit): void
    {
        $artifactState = $explicit ? 'estado_artefacto_exportacion' : 'estado';
        $notificationType = $explicit ? 'tipo_notificacion_interna' : 'tipo';
        $notificationTitle = $explicit ? 'titulo_notificacion_interna' : 'titulo';
        $notificationMessage = $explicit ? 'mensaje_notificacion_interna' : 'mensaje';
        $outboxContent = $explicit ? 'contenido_evento_saliente' : 'contenido';

        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION validar_artefacto_exportacion() RETURNS trigger AS \$\$
            DECLARE
                silabo_revision uuid;
                plantilla_silabo uuid;
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Un artefacto de exportación no puede eliminarse' USING ERRCODE = '23514';
                END IF;
                SELECT r.silabo_id, s.plantilla_id
                INTO silabo_revision, plantilla_silabo
                FROM revisiones_silabo r
                JOIN silabos s ON s.id = r.silabo_id
                WHERE r.id = NEW.revision_silabo_id;
                IF silabo_revision IS DISTINCT FROM NEW.silabo_id
                   OR plantilla_silabo IS DISTINCT FROM NEW.plantilla_id THEN
                    RAISE EXCEPTION 'El artefacto no coincide con la revisión y plantilla del sílabo' USING ERRCODE = '23514';
                END IF;
                IF TG_OP = 'UPDATE' AND OLD.{$artifactState} = 'completado' AND NEW IS DISTINCT FROM OLD THEN
                    RAISE EXCEPTION 'Un artefacto completado es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION proteger_notificacion_interna() RETURNS trigger AS \$\$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
                   OR NEW.clave_deduplicacion IS DISTINCT FROM OLD.clave_deduplicacion
                   OR NEW.{$notificationType} IS DISTINCT FROM OLD.{$notificationType}
                   OR NEW.{$notificationTitle} IS DISTINCT FROM OLD.{$notificationTitle}
                   OR NEW.{$notificationMessage} IS DISTINCT FROM OLD.{$notificationMessage}
                   OR NEW.tipo_recurso IS DISTINCT FROM OLD.tipo_recurso
                   OR NEW.recurso_id IS DISTINCT FROM OLD.recurso_id
                   OR NEW.notificado_en IS DISTINCT FROM OLD.notificado_en THEN
                    RAISE EXCEPTION 'El contenido de la notificación es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION proteger_contenido_evento_saliente() RETURNS trigger AS \$\$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.tipo_agregado IS DISTINCT FROM OLD.tipo_agregado
                   OR NEW.agregado_id IS DISTINCT FROM OLD.agregado_id
                   OR NEW.tipo_evento IS DISTINCT FROM OLD.tipo_evento
                   OR NEW.clave_deduplicacion IS DISTINCT FROM OLD.clave_deduplicacion
                   OR NEW.{$outboxContent} IS DISTINCT FROM OLD.{$outboxContent}
                   OR NEW.ocurrido_en IS DISTINCT FROM OLD.ocurrido_en THEN
                    RAISE EXCEPTION 'La identidad y contenido del evento saliente son inmutables' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;
            SQL);
    }
};
