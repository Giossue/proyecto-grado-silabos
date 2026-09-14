<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * El colaborador referencia una responsabilidad de paralelo, no una tabla genérica
     * de "asignaciones de docente". El nombre físico acompaña la normalización 000056.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE colaboradores_silabo RENAME COLUMN asignacion_docente_id TO docente_paralelo_id');
        DB::statement('ALTER TABLE colaboradores_silabo RENAME CONSTRAINT colaboradores_silabo_asignacion_docente_id_foreign TO colaboradores_silabo_docente_paralelo_id_foreign');
        DB::statement('ALTER TABLE colaboradores_silabo RENAME CONSTRAINT colaboradores_silabo_silabo_id_asignacion_docente_id_unique TO colaboradores_silabo_silabo_id_docente_paralelo_id_unique');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE colaboradores_silabo RENAME CONSTRAINT colaboradores_silabo_docente_paralelo_id_foreign TO colaboradores_silabo_asignacion_docente_id_foreign');
        DB::statement('ALTER TABLE colaboradores_silabo RENAME CONSTRAINT colaboradores_silabo_silabo_id_docente_paralelo_id_unique TO colaboradores_silabo_silabo_id_asignacion_docente_id_unique');
        DB::statement('ALTER TABLE colaboradores_silabo RENAME COLUMN docente_paralelo_id TO asignacion_docente_id');
    }
};
