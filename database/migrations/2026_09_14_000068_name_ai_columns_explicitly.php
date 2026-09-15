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
                'ejecuciones_ia' => [
                    'estado' => 'estado_ejecucion_ia',
                    'contenido_entrada' => 'contenido_entrada_ia',
                    'metadatos_entrada' => 'metadatos_entrada_ia',
                ],
                'evidencias_ia' => ['extracto' => 'extracto_evidencia_ia'],
                'recomendaciones_ia' => [
                    'tipo' => 'tipo_recomendacion_ia',
                    'titulo' => 'titulo_recomendacion_ia',
                    'explicacion' => 'explicacion_recomendacion_ia',
                ],
                'retroalimentacion_ia' => [
                    'decision' => 'decision_retroalimentacion_ia',
                    'contenido_antes' => 'contenido_anterior_retroalimentacion_ia',
                    'contenido_despues' => 'contenido_posterior_retroalimentacion_ia',
                ],
            ]
            : [
                'ejecuciones_ia' => [
                    'estado_ejecucion_ia' => 'estado',
                    'contenido_entrada_ia' => 'contenido_entrada',
                    'metadatos_entrada_ia' => 'metadatos_entrada',
                ],
                'evidencias_ia' => ['extracto_evidencia_ia' => 'extracto'],
                'recomendaciones_ia' => [
                    'tipo_recomendacion_ia' => 'tipo',
                    'titulo_recomendacion_ia' => 'titulo',
                    'explicacion_recomendacion_ia' => 'explicacion',
                ],
                'retroalimentacion_ia' => [
                    'decision_retroalimentacion_ia' => 'decision',
                    'contenido_anterior_retroalimentacion_ia' => 'contenido_antes',
                    'contenido_posterior_retroalimentacion_ia' => 'contenido_despues',
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
        $state = $explicit ? 'estado_ejecucion_ia' : 'estado';
        $content = $explicit ? 'contenido_entrada_ia' : 'contenido_entrada';
        $metadata = $explicit ? 'metadatos_entrada_ia' : 'metadatos_entrada';

        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION validar_ejecucion_ia() RETURNS trigger AS \$\$
            DECLARE
                plantilla_silabo uuid;
                plantilla_campo uuid;
            BEGIN
                SELECT plantilla_id INTO plantilla_silabo
                FROM silabos WHERE id = NEW.silabo_id;
                SELECT plantilla_id INTO plantilla_campo
                FROM definiciones_campo WHERE id = NEW.definicion_campo_id;

                IF plantilla_silabo IS DISTINCT FROM NEW.plantilla_id
                   OR plantilla_campo IS DISTINCT FROM NEW.plantilla_id THEN
                    RAISE EXCEPTION 'La ejecución de IA no coincide con la plantilla y campo del sílabo' USING ERRCODE = '23514';
                END IF;

                IF TG_OP = 'UPDATE' THEN
                    IF OLD.{$state} IN ('completada', 'no_concluyente', 'fallida') THEN
                        RAISE EXCEPTION 'Una ejecución de IA terminal es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF NEW.id IS DISTINCT FROM OLD.id
                       OR NEW.silabo_id IS DISTINCT FROM OLD.silabo_id
                       OR NEW.definicion_campo_id IS DISTINCT FROM OLD.definicion_campo_id
                       OR NEW.plantilla_id IS DISTINCT FROM OLD.plantilla_id
                       OR NEW.clave_idempotencia IS DISTINCT FROM OLD.clave_idempotencia
                       OR NEW.clave_funcional IS DISTINCT FROM OLD.clave_funcional
                       OR NEW.version_contrato IS DISTINCT FROM OLD.version_contrato
                       OR NEW.version_instruccion IS DISTINCT FROM OLD.version_instruccion
                       OR NEW.version_pasarela_solicitada IS DISTINCT FROM OLD.version_pasarela_solicitada
                       OR NEW.idioma IS DISTINCT FROM OLD.idioma
                       OR NEW.{$content} IS DISTINCT FROM OLD.{$content}
                       OR NEW.huella_contenido IS DISTINCT FROM OLD.huella_contenido
                       OR NEW.huella_conjunto_fuentes IS DISTINCT FROM OLD.huella_conjunto_fuentes
                       OR NEW.{$metadata} IS DISTINCT FROM OLD.{$metadata}
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
            \$\$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_evidencia_ia() RETURNS trigger AS \$\$
            DECLARE
                carrera_fuente uuid;
                carrera_silabo uuid;
                fuente_activa boolean;
                convocatoria_silabo uuid;
                estado_ejecucion text;
            BEGIN
                SELECT fuente_academica_activa, carrera_id INTO fuente_activa, carrera_fuente
                FROM fuentes_academicas WHERE id = NEW.fuente_academica_id;
                SELECT s.convocatoria_id, c.carrera_id, e.{$state}
                INTO convocatoria_silabo, carrera_silabo, estado_ejecucion
                FROM ejecuciones_ia e
                JOIN silabos s ON s.id = e.silabo_id
                JOIN convocatorias_carreras c ON c.id = s.convocatoria_id
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
            \$\$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_recomendacion_ia() RETURNS trigger AS \$\$
            DECLARE campo_ejecucion uuid;
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT definicion_campo_id, {$state} INTO campo_ejecucion, estado_ejecucion
                FROM ejecuciones_ia WHERE id = NEW.ejecucion_ia_id;
                IF campo_ejecucion IS DISTINCT FROM NEW.definicion_campo_id
                   OR estado_ejecucion IS DISTINCT FROM 'en_ejecucion' THEN
                    RAISE EXCEPTION 'La recomendación no corresponde al campo analizado' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_recomendacion_evidencia_ia() RETURNS trigger AS \$\$
            DECLARE ejecucion_recomendacion uuid;
            DECLARE ejecucion_evidencia uuid;
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT r.ejecucion_ia_id, e.{$state}
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
            \$\$ LANGUAGE plpgsql;

            CREATE OR REPLACE FUNCTION validar_retroalimentacion_ia() RETURNS trigger AS \$\$
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT e.{$state} INTO estado_ejecucion
                FROM recomendaciones_ia r
                JOIN ejecuciones_ia e ON e.id = r.ejecucion_ia_id
                WHERE r.id = NEW.recomendacion_ia_id;
                IF estado_ejecucion IS DISTINCT FROM 'completada' THEN
                    RAISE EXCEPTION 'Solo una recomendación completada admite decisión humana' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;
            SQL);
    }
};
