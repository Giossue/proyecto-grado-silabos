<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** @var list<array{string, string, string}> */
    private const RENAMES = [
        ['asignaciones_rol', 'activo', 'asignacion_rol_activa'],
        ['docentes_paralelo', 'activo', 'docente_paralelo_activo'],
        ['facultades', 'nombre', 'nombre_facultad'],
        ['facultades', 'activo', 'facultad_activa'],
        ['facultades', 'logo_ruta', 'ruta_logo_facultad'],
        ['campus', 'nombre', 'nombre_campus'],
        ['campus', 'activo', 'campus_activo'],
        ['carreras', 'nombre', 'nombre_carrera'],
        ['carreras', 'activo', 'carrera_activa'],
        ['carreras', 'modalidad', 'modalidad_carrera'],
        ['periodos_academicos', 'codigo', 'codigo_periodo_academico'],
        ['periodos_academicos', 'fecha_inicio', 'fecha_inicio_periodo'],
        ['periodos_academicos', 'fecha_fin', 'fecha_fin_periodo'],
        ['periodos_academicos', 'semanas_lectivas', 'cantidad_semanas_lectivas'],
        ['mallas', 'codigo', 'codigo_malla'],
        ['mallas', 'estado', 'estado_malla'],
        ['mallas', 'numero_ciclos', 'cantidad_ciclos_malla'],
        ['asignaturas', 'nombre', 'nombre_asignatura'],
        ['asignaturas', 'ciclo', 'ciclo_asignatura'],
        ['asignaturas', 'creditos', 'creditos_asignatura'],
        ['asignaturas', 'horas_totales', 'total_horas_asignatura'],
        ['asignaturas', 'activo', 'asignatura_activa'],
        ['asignaturas', 'orden_en_ciclo', 'orden_asignatura_en_ciclo'],
        ['asignaturas', 'unidad_organizacion_curricular', 'unidad_organizativa_curricular_asignatura'],
        ['asignaturas', 'modalidad', 'modalidad_asignatura'],
        ['programaciones_asignatura', 'activo', 'programacion_asignatura_activa'],
        ['programaciones_asignatura', 'modalidad', 'modalidad_programacion_asignatura'],
        ['paralelos', 'codigo', 'codigo_paralelo'],
        ['paralelos', 'activo', 'paralelo_activo'],
        ['paralelos', 'jornada', 'jornada_paralelo'],
        ['requisitos_asignatura', 'tipo', 'tipo_requisito_asignatura'],
    ];

    /** @var list<array{string, string}> */
    private const INDEX_RENAMES = [
        ['asignaturas_activo_index', 'asignaturas_asignatura_activa_index'],
        ['campus_activo_index', 'campus_campus_activo_index'],
        ['carreras_activo_index', 'carreras_carrera_activa_index'],
        ['docentes_paralelo_activa_idx', 'docentes_paralelo_activo_idx'],
        ['facultades_activo_index', 'facultades_facultad_activa_index'],
        ['mallas_carrera_id_codigo_unique', 'mallas_carrera_id_codigo_malla_unique'],
        ['paralelos_activo_index', 'paralelos_paralelo_activo_index'],
        ['paralelos_programacion_asignatura_id_codigo_unique', 'paralelos_programacion_asignatura_id_codigo_paralelo_unique'],
        ['periodos_codigo_unico', 'periodos_codigo_periodo_academico_unico'],
        ['ofertas_academicas_activo_index', 'programaciones_asignatura_activa_index'],
        ['requisitos_asignatura_asignatura_id_requisito_id_tipo_unique', 'requisitos_asignatura_asignatura_id_requisito_id_tipo_requisito_unique'],
    ];

    public function up(): void
    {
        foreach (self::RENAMES as [$table, $from, $to]) {
            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$from} TO {$to}");
        }

        foreach (self::INDEX_RENAMES as [$from, $to]) {
            DB::statement("ALTER INDEX {$from} RENAME TO {$to}");
        }

        $this->redefineCoordinatorConstraint('asignacion_rol_activa');
    }

    public function down(): void
    {
        foreach (array_reverse(self::INDEX_RENAMES) as [$from, $to]) {
            DB::statement("ALTER INDEX {$to} RENAME TO {$from}");
        }

        foreach (array_reverse(self::RENAMES) as [$table, $from, $to]) {
            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$to} TO {$from}");
        }

        $this->redefineCoordinatorConstraint('activo');
    }

    private function redefineCoordinatorConstraint(string $activeColumn): void
    {
        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION comprobar_coordinacion_activa_unica() RETURNS trigger AS $$
            BEGIN
                IF NEW.{$activeColumn}
                   AND NEW.carrera_id IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM roles
                       WHERE id = NEW.rol_id AND codigo_rol = 'coordinador'
                   )
                   AND EXISTS (
                       SELECT 1
                       FROM asignaciones_rol AS existente
                       INNER JOIN roles AS rol_existente ON rol_existente.id = existente.rol_id
                       INNER JOIN usuarios AS usuario_existente ON usuario_existente.id = existente.usuario_id
                       WHERE existente.carrera_id = NEW.carrera_id
                         AND existente.{$activeColumn}
                         AND usuario_existente.activo
                         AND rol_existente.codigo_rol = 'coordinador'
                         AND existente.id <> NEW.id
                   ) THEN
                    RAISE EXCEPTION 'La carrera ya tiene una coordinación activa' USING ERRCODE = '23505';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            SQL);
    }
};
