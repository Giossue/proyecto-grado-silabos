<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** @var array<string, array{string, string, string|null, string|null}> */
    private const RENAMES = [
        'facultades' => ['codigo_institucional', 'codigo_facultad', 'facultades_codigo_institucional_unique', 'facultades_codigo_facultad_unique'],
        'campus' => ['codigo_institucional', 'codigo_campus', 'campus_codigo_institucional_unique', 'campus_codigo_campus_unique'],
        'carreras' => ['codigo_institucional', 'codigo_carrera', 'carreras_codigo_institucional_unique', 'carreras_codigo_carrera_unique'],
        'asignaturas' => ['codigo_institucional', 'codigo_asignatura', 'asignaturas_malla_id_codigo_institucional_unique', 'asignaturas_malla_id_codigo_asignatura_unique'],
    ];

    public function up(): void
    {
        foreach (self::RENAMES as $table => [$from, $to, $oldIndex, $newIndex]) {
            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$from} TO {$to}");

            if ($oldIndex !== null && $newIndex !== null) {
                DB::statement("ALTER INDEX {$oldIndex} RENAME TO {$newIndex}");
            }
        }
    }

    public function down(): void
    {
        foreach (array_reverse(self::RENAMES, true) as $table => [$from, $to, $oldIndex, $newIndex]) {
            if ($oldIndex !== null && $newIndex !== null) {
                DB::statement("ALTER INDEX {$newIndex} RENAME TO {$oldIndex}");
            }

            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$to} TO {$from}");
        }
    }
};
