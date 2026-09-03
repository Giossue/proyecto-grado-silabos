<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * I-41: el período académico es institucional, no de cada carrera. Un proceso de
 * sílabos fija cuál período se trabaja y las convocatorias lo heredan. La consolidación
 * solo une filas de igual código cuando sus fechas son iguales: elegir una fecha distinta
 * destruiría evidencia académica.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->consolidatePeriods();

        DB::statement('DROP INDEX IF EXISTS periodos_codigo_global_unico');
        DB::statement('DROP INDEX IF EXISTS periodos_codigo_carrera_unico');
        DB::statement('ALTER TABLE periodos_academicos ADD CONSTRAINT periodos_codigo_unico UNIQUE (codigo)');

        Schema::table('periodos_academicos', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('carrera_id');
        });

        Schema::table('procesos_silabos', function (Blueprint $table): void {
            $table->foreignUuid('periodo_academico_id')->nullable()->after('plantilla_id')
                ->constrained('periodos_academicos')->restrictOnDelete();
        });

        $this->backfillProcessPeriods();
        DB::statement('ALTER TABLE procesos_silabos ALTER COLUMN periodo_academico_id SET NOT NULL');
        $this->addPeriodConsistencyTriggers();
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS convocatorias_periodo_del_proceso ON convocatorias');
        DB::statement('DROP TRIGGER IF EXISTS procesos_periodo_sin_convocatorias ON procesos_silabos');
        DB::statement('DROP FUNCTION IF EXISTS validar_periodo_convocatoria_proceso()');
        DB::statement('DROP FUNCTION IF EXISTS impedir_cambio_periodo_proceso_con_convocatorias()');

        Schema::table('procesos_silabos', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('periodo_academico_id');
        });
        DB::statement('ALTER TABLE periodos_academicos DROP CONSTRAINT IF EXISTS periodos_codigo_unico');

        Schema::table('periodos_academicos', function (Blueprint $table): void {
            $table->foreignUuid('carrera_id')->nullable()->after('id')
                ->constrained('carreras')->restrictOnDelete();
        });
        DB::statement('CREATE UNIQUE INDEX periodos_codigo_global_unico ON periodos_academicos (codigo) WHERE carrera_id IS NULL');
        DB::statement('CREATE UNIQUE INDEX periodos_codigo_carrera_unico ON periodos_academicos (codigo, carrera_id) WHERE carrera_id IS NOT NULL');
    }

    private function consolidatePeriods(): void
    {
        $codes = DB::table('periodos_academicos')
            ->select('codigo')
            ->groupBy('codigo')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('codigo');

        foreach ($codes as $code) {
            $periods = DB::table('periodos_academicos')
                ->where('codigo', $code)
                ->orderBy('creado_en')
                ->get(['id', 'fecha_inicio', 'fecha_fin']);
            $dates = $periods
                ->map(fn (object $period): string => "{$period->fecha_inicio}|{$period->fecha_fin}")
                ->unique();
            if ($dates->count() !== 1) {
                throw new RuntimeException("No se puede consolidar el período {$code}: sus fechas difieren entre carreras.");
            }

            $canonicalId = $periods->first()->id;
            foreach ($periods->skip(1) as $duplicate) {
                DB::table('ofertas_academicas')
                    ->where('periodo_academico_id', $duplicate->id)
                    ->update(['periodo_academico_id' => $canonicalId]);
                DB::table('convocatorias')
                    ->where('periodo_academico_id', $duplicate->id)
                    ->update(['periodo_academico_id' => $canonicalId]);
                DB::table('periodos_academicos')->where('id', $duplicate->id)->delete();
            }
        }
    }

    private function backfillProcessPeriods(): void
    {
        $processes = DB::table('procesos_silabos')->get(['id']);
        foreach ($processes as $process) {
            $periodIds = DB::table('convocatorias')
                ->where('proceso_id', $process->id)
                ->distinct()
                ->pluck('periodo_academico_id');
            if ($periodIds->count() > 1) {
                throw new RuntimeException("El proceso {$process->id} tiene convocatorias de períodos distintos; divídalo antes de migrar.");
            }
            if ($periodIds->count() === 1) {
                DB::table('procesos_silabos')
                    ->where('id', $process->id)
                    ->update(['periodo_academico_id' => $periodIds->first()]);

                continue;
            }

            $activePeriods = DB::table('periodos_academicos')->where('activo', true)->pluck('id');
            if ($activePeriods->count() !== 1) {
                throw new RuntimeException("El proceso {$process->id} no tiene convocatoria: debe existir exactamente un período institucional activo para asignarlo.");
            }
            DB::table('procesos_silabos')
                ->where('id', $process->id)
                ->update(['periodo_academico_id' => $activePeriods->first()]);
        }
    }

    private function addPeriodConsistencyTriggers(): void
    {
        // Las funciones no se eliminan cuando una base de pruebas reconstruye sus tablas.
        // Retirarlas explícitamente hace segura una nueva ejecución de las migraciones.
        DB::statement('DROP TRIGGER IF EXISTS convocatorias_periodo_del_proceso ON convocatorias');
        DB::statement('DROP TRIGGER IF EXISTS procesos_periodo_sin_convocatorias ON procesos_silabos');
        DB::statement('DROP FUNCTION IF EXISTS validar_periodo_convocatoria_proceso()');
        DB::statement('DROP FUNCTION IF EXISTS impedir_cambio_periodo_proceso_con_convocatorias()');

        DB::unprepared(<<<'SQL'
            CREATE FUNCTION validar_periodo_convocatoria_proceso() RETURNS trigger AS $$
            BEGIN
                IF NEW.periodo_academico_id IS DISTINCT FROM (
                    SELECT periodo_academico_id FROM procesos_silabos WHERE id = NEW.proceso_id
                ) THEN
                    RAISE EXCEPTION 'La convocatoria debe usar el período académico de su proceso.';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            CREATE TRIGGER convocatorias_periodo_del_proceso
                BEFORE INSERT OR UPDATE OF proceso_id, periodo_academico_id ON convocatorias
                FOR EACH ROW EXECUTE FUNCTION validar_periodo_convocatoria_proceso();
            SQL);
        DB::unprepared(<<<'SQL'
            CREATE FUNCTION impedir_cambio_periodo_proceso_con_convocatorias() RETURNS trigger AS $$
            BEGIN
                IF NEW.periodo_academico_id IS DISTINCT FROM OLD.periodo_academico_id
                    AND EXISTS (SELECT 1 FROM convocatorias WHERE proceso_id = OLD.id) THEN
                    RAISE EXCEPTION 'No se puede cambiar el período de un proceso con convocatorias.';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            CREATE TRIGGER procesos_periodo_sin_convocatorias
                BEFORE UPDATE OF periodo_academico_id ON procesos_silabos
                FOR EACH ROW EXECUTE FUNCTION impedir_cambio_periodo_proceso_con_convocatorias();
            SQL);
    }
};
