<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** I-62: completa el vocabulario técnico sin modificar datos ni nulabilidad. */
return new class extends Migration
{
    /** @var array<string, string> */
    private const CONSTRAINTS = [
        'ofertas_academicas_id_not_null' => 'programaciones_asignatura_id_not_null',
        'ofertas_academicas_periodo_academico_id_not_null' => 'programaciones_asignatura_periodo_academico_id_not_null',
        'ofertas_academicas_asignatura_id_not_null' => 'programaciones_asignatura_asignatura_id_not_null',
        'ofertas_academicas_campus_id_not_null' => 'programaciones_asignatura_campus_id_not_null',
        'ofertas_academicas_modalidad_not_null' => 'programaciones_asignatura_modalidad_not_null',
        'ofertas_academicas_activo_not_null' => 'programaciones_asignatura_activo_not_null',
    ];

    public function up(): void
    {
        foreach (self::CONSTRAINTS as $from => $to) {
            $this->renameConstraint($from, $to);
        }
    }

    public function down(): void
    {
        foreach (array_reverse(self::CONSTRAINTS, true) as $from => $to) {
            $this->renameConstraint($to, $from);
        }
    }

    private function renameConstraint(string $from, string $to): void
    {
        DB::statement("ALTER TABLE programaciones_asignatura RENAME CONSTRAINT {$from} TO {$to}");
    }
};
