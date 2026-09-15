<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * La fila representa una asignación operativa a un paralelo, no a un docente
     * directamente: el docente se deriva de su asignación de rol.
     */
    public function up(): void
    {
        Schema::rename('docentes_paralelo', 'asignaciones_paralelo');

        DB::statement('ALTER TABLE asignaciones_paralelo RENAME CONSTRAINT asignaciones_docente_pkey TO asignaciones_paralelo_pkey');
        DB::statement('ALTER TABLE asignaciones_paralelo RENAME CONSTRAINT asignaciones_docente_paralelo_id_foreign TO asignaciones_paralelo_paralelo_id_foreign');
        DB::statement('ALTER TABLE asignaciones_paralelo RENAME CONSTRAINT docentes_paralelo_asignacion_rol_id_foreign TO asignaciones_paralelo_asignacion_rol_id_foreign');
        DB::statement('ALTER INDEX docentes_paralelo_identidad_unica RENAME TO asignaciones_paralelo_identidad_unica');
        DB::statement('ALTER INDEX docentes_paralelo_activo_idx RENAME TO asignaciones_paralelo_activa_idx');
    }

    public function down(): void
    {
        DB::statement('ALTER INDEX asignaciones_paralelo_activa_idx RENAME TO docentes_paralelo_activo_idx');
        DB::statement('ALTER INDEX asignaciones_paralelo_identidad_unica RENAME TO docentes_paralelo_identidad_unica');
        DB::statement('ALTER TABLE asignaciones_paralelo RENAME CONSTRAINT asignaciones_paralelo_asignacion_rol_id_foreign TO docentes_paralelo_asignacion_rol_id_foreign');
        DB::statement('ALTER TABLE asignaciones_paralelo RENAME CONSTRAINT asignaciones_paralelo_paralelo_id_foreign TO asignaciones_docente_paralelo_id_foreign');
        DB::statement('ALTER TABLE asignaciones_paralelo RENAME CONSTRAINT asignaciones_paralelo_pkey TO asignaciones_docente_pkey');

        Schema::rename('asignaciones_paralelo', 'docentes_paralelo');
    }
};
