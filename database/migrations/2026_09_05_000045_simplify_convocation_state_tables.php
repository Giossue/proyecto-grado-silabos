<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('convocatorias_carreras')
            ->select(['carrera_id', 'proceso_id'])
            ->groupBy('carrera_id', 'proceso_id')
            ->havingRaw('COUNT(*) > 1')
            ->exists()) {
            throw new RuntimeException('Existen convocatorias duplicadas para una carrera y proceso.');
        }

        DB::statement('DROP TRIGGER IF EXISTS convocatorias_carreras_periodo_universidad ON convocatorias_carreras');
        DB::statement('DROP FUNCTION IF EXISTS validar_periodo_convocatoria_proceso()');
        DB::statement('DROP INDEX IF EXISTS convocatorias_carrera_periodo_unico');
        DB::statement('CREATE UNIQUE INDEX convocatorias_carrera_proceso_unico ON convocatorias_carreras (carrera_id, proceso_id)');
        DB::unprepared(<<<'SQL'
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
            $$ LANGUAGE plpgsql;
            SQL);

        Schema::table('convocatorias_carreras', function (Blueprint $table): void {
            $table->dropColumn([
                'periodo_academico_id',
                'plantilla_id',
                'creado_por',
                'abierto_por',
                'abierto_en',
                'cerrado_en',
                'actualizado_en',
            ]);
        });

        Schema::table('convocatorias_universidad', function (Blueprint $table): void {
            $table->dropColumn([
                'creado_por',
                'abierto_por',
                'abierto_en',
                'pausado_en',
                'cerrado_en',
                'actualizado_en',
            ]);
        });
    }

    public function down(): void
    {
        throw new RuntimeException('I-52 no admite reversión automática de datos históricos.');
    }
};
