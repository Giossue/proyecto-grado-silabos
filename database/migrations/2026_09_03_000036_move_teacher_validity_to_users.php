<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** I-42: la relación laboral es de la persona, no de cada paralelo. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('usuarios', function (Blueprint $table): void {
            $table->date('vigente_desde')->nullable()->after('activo');
            $table->date('vigente_hasta')->nullable()->after('vigente_desde');
        });

        // Si una cuenta tenía varios paralelos, el rango laboral más amplio conserva su
        // acceso histórico sin cerrar artificialmente intervalos que antes estaban abiertos.
        DB::statement(<<<'SQL'
            UPDATE usuarios AS usuario
            SET vigente_desde = resumen.primera_fecha,
                vigente_hasta = resumen.ultima_fecha
            FROM (
                SELECT usuario_id,
                    MIN(vigente_desde::date) AS primera_fecha,
                    CASE
                        WHEN BOOL_OR(vigente_hasta IS NULL) THEN NULL
                        ELSE MAX(vigente_hasta::date)
                    END AS ultima_fecha
                FROM asignaciones_docente
                GROUP BY usuario_id
            ) AS resumen
            WHERE resumen.usuario_id = usuario.id
            SQL);
        DB::statement('ALTER TABLE usuarios ADD CONSTRAINT usuarios_vigencia_laboral_check CHECK (vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde)');

        DB::statement('ALTER TABLE asignaciones_docente DROP CONSTRAINT IF EXISTS asignacion_docente_sin_solapamiento');
        DB::statement('ALTER TABLE asignaciones_docente DROP CONSTRAINT IF EXISTS asignaciones_docente_vigencia_check');
        DB::statement('ALTER TABLE asignaciones_docente DROP CONSTRAINT IF EXISTS asignacion_docente_identidad_unica');
        DB::statement('DROP INDEX IF EXISTS asignacion_docente_identidad_unica');
        DB::statement('DROP INDEX IF EXISTS asignacion_docente_vigencia_idx');

        Schema::table('asignaciones_docente', function (Blueprint $table): void {
            $table->dropColumn(['vigente_desde', 'vigente_hasta']);
            $table->unique(['usuario_id', 'paralelo_id'], 'asignacion_docente_identidad_unica');
            $table->index(['usuario_id', 'activo'], 'asignacion_docente_activa_idx');
        });
    }

    public function down(): void
    {
        Schema::table('asignaciones_docente', function (Blueprint $table): void {
            $table->dropUnique('asignacion_docente_identidad_unica');
            $table->dropIndex('asignacion_docente_activa_idx');
            $table->timestampTz('vigente_desde')->nullable();
            $table->timestampTz('vigente_hasta')->nullable();
        });
        DB::statement(<<<'SQL'
            UPDATE asignaciones_docente AS asignacion
            SET vigente_desde = COALESCE(usuario.vigente_desde::timestamptz, asignacion.creado_en),
                vigente_hasta = usuario.vigente_hasta::timestamptz
            FROM usuarios AS usuario
            WHERE usuario.id = asignacion.usuario_id
            SQL);
        DB::statement('ALTER TABLE asignaciones_docente ALTER COLUMN vigente_desde SET NOT NULL');
        DB::statement('ALTER TABLE asignaciones_docente ADD CONSTRAINT asignaciones_docente_vigencia_check CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)');
        DB::statement('CREATE UNIQUE INDEX asignacion_docente_identidad_unica ON asignaciones_docente (usuario_id, paralelo_id, vigente_desde)');
        DB::statement('CREATE INDEX asignacion_docente_vigencia_idx ON asignaciones_docente (usuario_id, activo, vigente_desde, vigente_hasta)');
        DB::statement(<<<'SQL'
            ALTER TABLE asignaciones_docente ADD CONSTRAINT asignacion_docente_sin_solapamiento
            EXCLUDE USING gist (
                usuario_id WITH =,
                paralelo_id WITH =,
                tstzrange(vigente_desde, COALESCE(vigente_hasta, 'infinity'::timestamptz), '[)') WITH &&
            ) WHERE (activo)
            SQL);

        DB::statement('ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_vigencia_laboral_check');
        Schema::table('usuarios', function (Blueprint $table): void {
            $table->dropColumn(['vigente_desde', 'vigente_hasta']);
        });
    }
};
