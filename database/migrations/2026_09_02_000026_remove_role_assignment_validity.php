<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Al retirar la programación automática, las asignaciones que ya no estaban
        // efectivas se archivan. Así no se reactivan roles históricos ni se crean
        // duplicados al imponer una sola asignación activa por alcance.
        DB::statement(<<<'SQL'
            UPDATE asignaciones_rol
            SET activo = false
            WHERE activo
              AND (
                  vigente_desde > CURRENT_TIMESTAMP
                  OR vigente_hasta IS NOT NULL AND vigente_hasta <= CURRENT_TIMESTAMP
              )
            SQL);

        DB::statement('ALTER TABLE asignaciones_rol DROP CONSTRAINT IF EXISTS asignacion_rol_sin_solapamiento');
        DB::statement('ALTER TABLE asignaciones_rol DROP CONSTRAINT IF EXISTS asignaciones_rol_vigencia_check');

        Schema::table('asignaciones_rol', function (Blueprint $table): void {
            $table->dropUnique('asignacion_rol_identidad_unica');
            $table->dropIndex('asignacion_rol_vigencia_idx');
            $table->dropColumn(['vigente_desde', 'vigente_hasta']);
        });

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX asignacion_rol_activa_unica
            ON asignaciones_rol (
                usuario_id,
                rol_id,
                (COALESCE(carrera_id, '00000000-0000-0000-0000-000000000000'::uuid))
            )
            WHERE activo
            SQL);
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS asignacion_rol_activa_unica');

        Schema::table('asignaciones_rol', function (Blueprint $table): void {
            $table->timestampTz('vigente_desde')->nullable();
            $table->timestampTz('vigente_hasta')->nullable();
        });

        DB::table('asignaciones_rol')->update(['vigente_desde' => DB::raw('creado_en')]);
        DB::statement('ALTER TABLE asignaciones_rol ALTER COLUMN vigente_desde SET NOT NULL');
        DB::statement('ALTER TABLE asignaciones_rol ADD CONSTRAINT asignaciones_rol_vigencia_check CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)');

        Schema::table('asignaciones_rol', function (Blueprint $table): void {
            $table->unique(['usuario_id', 'rol_id', 'carrera_id', 'vigente_desde'], 'asignacion_rol_identidad_unica');
            $table->index(['usuario_id', 'activo', 'vigente_desde', 'vigente_hasta'], 'asignacion_rol_vigencia_idx');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE asignaciones_rol
            ADD CONSTRAINT asignacion_rol_sin_solapamiento
            EXCLUDE USING gist (
                usuario_id WITH =,
                rol_id WITH =,
                (COALESCE(carrera_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
                tstzrange(vigente_desde, COALESCE(vigente_hasta, 'infinity'::timestamptz), '[)') WITH &&
            ) WHERE (activo)
            SQL);
    }
};
