<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('versiones_malla', function (Blueprint $table) {
            $table->boolean('es_actual')->default(false)->after('estado');
        });

        DB::statement(<<<'SQL'
            WITH ordenadas AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY carrera_id
                           ORDER BY created_at DESC, numero_version DESC, id DESC
                       ) AS posicion
                FROM versiones_malla
            )
            UPDATE versiones_malla AS malla
            SET es_actual = ordenadas.posicion = 1
            FROM ordenadas
            WHERE malla.id = ordenadas.id
            SQL);

        DB::statement('ALTER TABLE versiones_malla DROP CONSTRAINT versiones_malla_estado_check');
        DB::statement(<<<'SQL'
            UPDATE versiones_malla
            SET estado = CASE
                WHEN es_actual AND estado = 'published' THEN 'active'
                WHEN es_actual THEN 'inactive'
                ELSE 'historical'
            END,
            publicado_en = NULL
            SQL);
        DB::statement("ALTER TABLE versiones_malla ADD CONSTRAINT versiones_malla_estado_check CHECK (estado IN ('active', 'inactive', 'historical'))");
        DB::statement('CREATE UNIQUE INDEX versiones_malla_actual_carrera_unique ON versiones_malla (carrera_id) WHERE es_actual');

        Schema::table('silabos', function (Blueprint $table) {
            $table->jsonb('contexto_academico')->nullable()->after('version_plantilla_id');
        });

        DB::statement(<<<'SQL'
            UPDATE silabos AS silabo
            SET contexto_academico = jsonb_build_object(
                'schema_version', 1,
                'curriculum', jsonb_build_object(
                    'id', malla.id,
                    'code', malla.codigo,
                    'cycle_count', malla.numero_ciclos
                ),
                'subject', jsonb_build_object(
                    'id', materia.id,
                    'code', materia.codigo_institucional,
                    'name', materia.nombre,
                    'cycle', materia.ciclo,
                    'position', materia.orden_en_ciclo,
                    'organization_unit', materia.unidad_organizacion_curricular,
                    'credits', materia.creditos,
                    'total_hours', materia.horas_totales,
                    'hours_project', materia.horas_proyecto,
                    'hours_ap', materia.horas_ap,
                    'hours_ac', materia.horas_ac,
                    'hours_pae', materia.horas_pae,
                    'hours_aa', materia.horas_aa,
                    'hours_paec', materia.horas_paec,
                    'custom_fields', '[]'::jsonb
                )
            )
            FROM asignaturas AS materia
            JOIN versiones_malla AS malla ON malla.id = materia.version_malla_id
            WHERE materia.id = silabo.asignatura_id
            SQL);
        DB::statement('ALTER TABLE silabos ALTER COLUMN contexto_academico SET NOT NULL');
        DB::statement("ALTER TABLE silabos ALTER COLUMN contexto_academico SET DEFAULT '{}'::jsonb");
    }

    public function down(): void
    {
        Schema::table('silabos', function (Blueprint $table) {
            $table->dropColumn('contexto_academico');
        });

        DB::statement('DROP INDEX IF EXISTS versiones_malla_actual_carrera_unique');
        DB::statement('ALTER TABLE versiones_malla DROP CONSTRAINT versiones_malla_estado_check');
        DB::statement(<<<'SQL'
            UPDATE versiones_malla
            SET estado = CASE
                WHEN estado = 'active' THEN 'published'
                ELSE 'inactive'
            END
            SQL);
        DB::statement("ALTER TABLE versiones_malla ADD CONSTRAINT versiones_malla_estado_check CHECK (estado IN ('draft', 'published', 'inactive'))");

        Schema::table('versiones_malla', function (Blueprint $table) {
            $table->dropColumn('es_actual');
        });
    }
};
