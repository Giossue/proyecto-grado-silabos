<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('asignaciones_coordinador')
            ->where('activo', true)
            ->select('carrera_id')
            ->groupBy('carrera_id')
            ->havingRaw('COUNT(*) > 1')
            ->exists()) {
            throw new RuntimeException('Existe más de una coordinación activa para una carrera.');
        }

        DB::statement('ALTER TABLE asignaciones_coordinador DROP CONSTRAINT IF EXISTS coordinador_sin_solapamiento');
        DB::statement('ALTER TABLE asignaciones_coordinador DROP CONSTRAINT IF EXISTS asignaciones_coordinador_vigencia_check');
        DB::statement('ALTER TABLE asignaciones_coordinador DROP CONSTRAINT IF EXISTS asignaciones_coordinador_encargo_check');

        Schema::table('asignaciones_coordinador', function (Blueprint $table): void {
            $table->dropColumn(['vigente_desde', 'vigente_hasta']);
        });

        DB::statement('CREATE UNIQUE INDEX asignaciones_coordinador_una_activa_por_carrera ON asignaciones_coordinador (carrera_id) WHERE activo');
    }

    public function down(): void
    {
        throw new RuntimeException('I-52 elimina vigencias programadas y no admite reversión automática. Restaure el respaldo previo.');
    }
};
