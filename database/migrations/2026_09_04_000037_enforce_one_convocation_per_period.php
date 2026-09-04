<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('procesos_silabos')->select('periodo_academico_id')->groupBy('periodo_academico_id')->havingRaw('COUNT(*) > 1')->exists()
            || DB::table('convocatorias')->select('carrera_id', 'periodo_academico_id')->groupBy('carrera_id', 'periodo_academico_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Existen convocatorias duplicadas para el mismo período; corríjalas antes de migrar.');
        }

        DB::statement('CREATE UNIQUE INDEX procesos_silabos_periodo_unico ON procesos_silabos (periodo_academico_id)');
        DB::statement('CREATE UNIQUE INDEX convocatorias_carrera_periodo_unico ON convocatorias (carrera_id, periodo_academico_id)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS convocatorias_carrera_periodo_unico');
        DB::statement('DROP INDEX IF EXISTS procesos_silabos_periodo_unico');
    }
};
