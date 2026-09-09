<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * I-62: «oferta académica» se reserva para carreras/programas aprobados por el CES.
 * Esta tabla representa la programación interna de una asignatura en un período.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::rename('ofertas_academicas', 'programaciones_asignatura');

        Schema::table('paralelos', function (Blueprint $table): void {
            $table->renameColumn('oferta_academica_id', 'programacion_asignatura_id');
        });
        Schema::table('alcances_silabo', function (Blueprint $table): void {
            $table->renameColumn('oferta_academica_id', 'programacion_asignatura_id');
        });

        $this->renameConstraint(
            'programaciones_asignatura',
            'ofertas_academicas_pkey',
            'programaciones_asignatura_pkey',
        );
        $this->renameConstraint(
            'programaciones_asignatura',
            'ofertas_academicas_periodo_academico_id_foreign',
            'programaciones_asignatura_periodo_academico_id_foreign',
        );
        $this->renameConstraint(
            'programaciones_asignatura',
            'ofertas_academicas_asignatura_id_foreign',
            'programaciones_asignatura_asignatura_id_foreign',
        );
        $this->renameConstraint(
            'programaciones_asignatura',
            'ofertas_academicas_campus_id_foreign',
            'programaciones_asignatura_campus_id_foreign',
        );
        $this->renameConstraint(
            'paralelos',
            'paralelos_oferta_academica_id_foreign',
            'paralelos_programacion_asignatura_id_foreign',
        );
        $this->renameConstraint(
            'paralelos',
            'paralelos_oferta_academica_id_codigo_unique',
            'paralelos_programacion_asignatura_id_codigo_unique',
        );
        $this->renameConstraint(
            'alcances_silabo',
            'alcances_silabo_oferta_academica_id_foreign',
            'alcances_silabo_programacion_asignatura_id_foreign',
        );

        DB::statement(<<<'SQL'
            ALTER TABLE programaciones_asignatura
            ADD CONSTRAINT programacion_asignatura_periodo_materia_unica
            UNIQUE (periodo_academico_id, asignatura_id)
        SQL);

        // Los eventos ya escritos son evidencia histórica append-only. Conservan el
        // vocabulario vigente cuando ocurrieron; los eventos nuevos usan la terminología I-62.
    }

    public function down(): void
    {
        DB::statement(<<<'SQL'
            ALTER TABLE programaciones_asignatura
            DROP CONSTRAINT programacion_asignatura_periodo_materia_unica
        SQL);

        $this->renameConstraint(
            'alcances_silabo',
            'alcances_silabo_programacion_asignatura_id_foreign',
            'alcances_silabo_oferta_academica_id_foreign',
        );
        $this->renameConstraint(
            'paralelos',
            'paralelos_programacion_asignatura_id_codigo_unique',
            'paralelos_oferta_academica_id_codigo_unique',
        );
        $this->renameConstraint(
            'paralelos',
            'paralelos_programacion_asignatura_id_foreign',
            'paralelos_oferta_academica_id_foreign',
        );
        $this->renameConstraint(
            'programaciones_asignatura',
            'programaciones_asignatura_campus_id_foreign',
            'ofertas_academicas_campus_id_foreign',
        );
        $this->renameConstraint(
            'programaciones_asignatura',
            'programaciones_asignatura_asignatura_id_foreign',
            'ofertas_academicas_asignatura_id_foreign',
        );
        $this->renameConstraint(
            'programaciones_asignatura',
            'programaciones_asignatura_periodo_academico_id_foreign',
            'ofertas_academicas_periodo_academico_id_foreign',
        );
        $this->renameConstraint(
            'programaciones_asignatura',
            'programaciones_asignatura_pkey',
            'ofertas_academicas_pkey',
        );

        Schema::table('alcances_silabo', function (Blueprint $table): void {
            $table->renameColumn('programacion_asignatura_id', 'oferta_academica_id');
        });
        Schema::table('paralelos', function (Blueprint $table): void {
            $table->renameColumn('programacion_asignatura_id', 'oferta_academica_id');
        });

        Schema::rename('programaciones_asignatura', 'ofertas_academicas');
    }

    private function renameConstraint(string $table, string $from, string $to): void
    {
        DB::statement("ALTER TABLE {$table} RENAME CONSTRAINT {$from} TO {$to}");
    }
};
