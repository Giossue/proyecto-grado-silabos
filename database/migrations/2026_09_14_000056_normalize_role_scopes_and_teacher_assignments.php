<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Conserva RBAC con alcance en `asignaciones_rol` y elimina la coordinación
     * duplicada. La asignación operativa a paralelo queda respaldada por el rol docente.
     */
    public function up(): void
    {
        if (Schema::hasTable('asignaciones_docente')) {
            Schema::rename('asignaciones_docente', 'docentes_paralelo');
        }

        if (! Schema::hasColumn('docentes_paralelo', 'asignacion_rol_id')) {
            Schema::table('docentes_paralelo', function (Blueprint $table): void {
                $table->uuid('asignacion_rol_id')->nullable()->after('id');
            });
        }

        DB::statement(<<<'SQL'
            UPDATE docentes_paralelo AS docente_paralelo
            SET asignacion_rol_id = asignacion.id
            FROM paralelos AS paralelo
            INNER JOIN programaciones_asignatura AS programacion ON programacion.id = paralelo.programacion_asignatura_id
            INNER JOIN asignaturas AS asignatura ON asignatura.id = programacion.asignatura_id
            INNER JOIN mallas AS malla ON malla.id = asignatura.malla_id
            INNER JOIN asignaciones_rol AS asignacion ON asignacion.carrera_id = malla.carrera_id
            INNER JOIN roles AS rol ON rol.id = asignacion.rol_id
            WHERE paralelo.id = docente_paralelo.paralelo_id
              AND asignacion.usuario_id = docente_paralelo.usuario_id
              AND asignacion.activo
              AND rol.codigo = 'docente'
              AND docente_paralelo.asignacion_rol_id IS NULL
        SQL);

        if (DB::table('docentes_paralelo')->whereNull('asignacion_rol_id')->exists()) {
            throw new RuntimeException('No se puede normalizar docentes_paralelo: existe una asignación sin rol docente activo en su carrera.');
        }

        DB::statement('ALTER TABLE docentes_paralelo DROP CONSTRAINT asignaciones_docente_usuario_id_foreign');
        DB::statement('ALTER TABLE docentes_paralelo DROP CONSTRAINT asignacion_docente_identidad_unica');
        DB::statement('DROP INDEX asignacion_docente_activa_idx');

        Schema::table('docentes_paralelo', function (Blueprint $table): void {
            $table->foreign('asignacion_rol_id')
                ->references('id')
                ->on('asignaciones_rol')
                ->restrictOnDelete();
            $table->dropColumn('usuario_id');
        });

        DB::statement('ALTER TABLE docentes_paralelo ALTER COLUMN asignacion_rol_id SET NOT NULL');
        DB::statement('CREATE UNIQUE INDEX docentes_paralelo_identidad_unica ON docentes_paralelo (asignacion_rol_id, paralelo_id)');
        DB::statement('CREATE INDEX docentes_paralelo_activa_idx ON docentes_paralelo (asignacion_rol_id, activo)');

        Schema::dropIfExists('asignaciones_coordinador');
    }

    public function down(): void
    {
        Schema::create('asignaciones_coordinador', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('carrera_id')->constrained('carreras')->restrictOnDelete();
            $table->boolean('activo')->default(true);
        });
        DB::statement('CREATE UNIQUE INDEX asignaciones_coordinador_una_activa_por_carrera ON asignaciones_coordinador (carrera_id) WHERE activo');

        DB::statement(<<<'SQL'
            INSERT INTO asignaciones_coordinador (id, usuario_id, carrera_id, activo)
            SELECT asignacion.id, asignacion.usuario_id, asignacion.carrera_id, asignacion.activo
            FROM asignaciones_rol AS asignacion
            INNER JOIN roles AS rol ON rol.id = asignacion.rol_id
            WHERE rol.codigo = 'coordinador' AND asignacion.carrera_id IS NOT NULL
        SQL);

        DB::statement('ALTER TABLE docentes_paralelo DROP CONSTRAINT docentes_paralelo_asignacion_rol_id_foreign');
        DB::statement('DROP INDEX docentes_paralelo_identidad_unica');
        DB::statement('DROP INDEX docentes_paralelo_activa_idx');

        Schema::table('docentes_paralelo', function (Blueprint $table): void {
            $table->uuid('usuario_id')->nullable()->after('id');
        });
        DB::statement(<<<'SQL'
            UPDATE docentes_paralelo
            SET usuario_id = asignaciones_rol.usuario_id
            FROM asignaciones_rol
            WHERE asignaciones_rol.id = docentes_paralelo.asignacion_rol_id
        SQL);
        DB::statement('ALTER TABLE docentes_paralelo ALTER COLUMN usuario_id SET NOT NULL');
        Schema::table('docentes_paralelo', function (Blueprint $table): void {
            $table->foreign('usuario_id')->references('id')->on('usuarios')->restrictOnDelete();
            $table->dropColumn('asignacion_rol_id');
        });
        DB::statement('CREATE UNIQUE INDEX asignacion_docente_identidad_unica ON docentes_paralelo (usuario_id, paralelo_id)');
        DB::statement('CREATE INDEX asignacion_docente_activa_idx ON docentes_paralelo (usuario_id, activo)');

        Schema::rename('docentes_paralelo', 'asignaciones_docente');
    }
};
