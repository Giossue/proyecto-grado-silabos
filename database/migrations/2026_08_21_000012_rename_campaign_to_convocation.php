<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * «Campaña» se sustituye por «convocatoria»: es el término que usa la Coordinación para
 * un proceso académico con plazo, y no arrastra el tono comercial del anterior.
 *
 * Las migraciones anteriores conservan los nombres con los que se creó el esquema; el
 * cambio se aplica aquí para no reescribir la historia.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE campanias RENAME TO convocatorias');
        DB::statement('ALTER TABLE fechas_limite_campania RENAME TO fechas_limite_convocatoria');
        DB::statement('ALTER TABLE fuentes_campania RENAME TO fuentes_convocatoria');

        foreach (['silabos', 'alcances_silabo', 'fechas_limite_convocatoria', 'fuentes_convocatoria'] as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN campania_id TO convocatoria_id");
        }

        // Renombrar una tabla no reescribe el cuerpo de las funciones que la consultan.
        $this->redefinirValidacionEvidencia();
    }

    /**
     * Misma regla que fijó I-06, con los nombres nuevos: una evidencia solo puede citar
     * una fuente activa, vigente y seleccionada por la convocatoria del expediente.
     */
    private function redefinirValidacionEvidencia(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION validar_evidencia_ia() RETURNS trigger AS $$
            DECLARE
                fuente_version uuid;
                version_fragmento uuid;
                carrera_fuente uuid;
                carrera_silabo uuid;
                fuente_activa boolean;
                estado_version text;
                desde date;
                hasta date;
                convocatoria_silabo uuid;
                estado_ejecucion text;
            BEGIN
                SELECT fuente_academica_id, estado, vigente_desde, vigente_hasta
                INTO fuente_version, estado_version, desde, hasta
                FROM versiones_fuente WHERE id = NEW.version_fuente_id;
                SELECT version_fuente_id INTO version_fragmento
                FROM fragmentos_fuente WHERE id = NEW.fragmento_fuente_id;
                SELECT activo, carrera_id INTO fuente_activa, carrera_fuente
                FROM fuentes_academicas WHERE id = NEW.fuente_academica_id;
                SELECT s.convocatoria_id, c.carrera_id, e.estado
                INTO convocatoria_silabo, carrera_silabo, estado_ejecucion
                FROM ejecuciones_ia e
                JOIN silabos s ON s.id = e.silabo_id
                JOIN convocatorias c ON c.id = s.convocatoria_id
                WHERE e.id = NEW.ejecucion_ia_id;

                IF fuente_version IS DISTINCT FROM NEW.fuente_academica_id
                   OR version_fragmento IS DISTINCT FROM NEW.version_fuente_id
                   OR carrera_fuente IS DISTINCT FROM carrera_silabo
                   OR fuente_activa IS DISTINCT FROM TRUE
                   OR estado_version IS DISTINCT FROM 'active'
                   OR estado_ejecucion IS DISTINCT FROM 'pending'
                   OR (desde IS NOT NULL AND desde > CURRENT_DATE)
                   OR (hasta IS NOT NULL AND hasta < CURRENT_DATE)
                   OR NOT EXISTS (
                       SELECT 1 FROM fuentes_convocatoria
                       WHERE convocatoria_id = convocatoria_silabo
                         AND version_fuente_id = NEW.version_fuente_id
                   ) THEN
                    RAISE EXCEPTION 'La evidencia debe citar una fuente activa y vigente de la convocatoria' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            SQL);
    }

    public function down(): void
    {
        foreach (['silabos', 'alcances_silabo', 'fechas_limite_convocatoria', 'fuentes_convocatoria'] as $tabla) {
            DB::statement("ALTER TABLE {$tabla} RENAME COLUMN convocatoria_id TO campania_id");
        }

        DB::statement('ALTER TABLE fuentes_convocatoria RENAME TO fuentes_campania');
        DB::statement('ALTER TABLE fechas_limite_convocatoria RENAME TO fechas_limite_campania');
        DB::statement('ALTER TABLE convocatorias RENAME TO campanias');
    }
};
