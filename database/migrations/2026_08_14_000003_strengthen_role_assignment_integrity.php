<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
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

        DB::statement(<<<'SQL'
            ALTER TABLE asignaciones_docente
            ADD CONSTRAINT asignacion_docente_sin_solapamiento
            EXCLUDE USING gist (
                usuario_id WITH =,
                paralelo_id WITH =,
                tstzrange(vigente_desde, COALESCE(vigente_hasta, 'infinity'::timestamptz), '[)') WITH &&
            ) WHERE (activo)
            SQL);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE asignaciones_rol DROP CONSTRAINT IF EXISTS asignacion_rol_sin_solapamiento');
        DB::statement('ALTER TABLE asignaciones_docente DROP CONSTRAINT IF EXISTS asignacion_docente_sin_solapamiento');
    }
};
