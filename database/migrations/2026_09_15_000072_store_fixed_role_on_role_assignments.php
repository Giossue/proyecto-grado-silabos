<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    private const ROLES = [
        'administrador' => 'Administrador',
        'coordinador' => 'Coordinador',
        'docente' => 'Docente',
    ];

    public function up(): void
    {
        Schema::table('asignaciones_rol', function (Blueprint $table): void {
            $table->string('rol', 20)->nullable()->after('usuario_id');
        });

        DB::statement(<<<'SQL'
            UPDATE asignaciones_rol AS asignacion
            SET rol = catalogo.codigo_rol
            FROM roles AS catalogo
            WHERE catalogo.id = asignacion.rol_id
        SQL);

        $missing = DB::table('asignaciones_rol')->whereNull('rol')->exists();
        $unexpected = DB::table('asignaciones_rol')
            ->whereNotIn('rol', array_keys(self::ROLES))
            ->exists();
        if ($missing || $unexpected) {
            throw new RuntimeException('No se puede retirar el catálogo de roles: existen asignaciones sin un rol fijo válido.');
        }

        DB::statement('ALTER TABLE asignaciones_rol ALTER COLUMN rol SET NOT NULL');
        DB::statement(<<<'SQL'
            ALTER TABLE asignaciones_rol
            ADD CONSTRAINT asignaciones_rol_rol_valido_check
            CHECK (rol IN ('administrador', 'coordinador', 'docente'))
        SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE asignaciones_rol
            ADD CONSTRAINT asignaciones_rol_alcance_valido_check
            CHECK (
                (rol = 'administrador' AND carrera_id IS NULL)
                OR (rol IN ('coordinador', 'docente') AND carrera_id IS NOT NULL)
            )
        SQL);

        DB::statement('DROP TRIGGER IF EXISTS asignaciones_rol_coordinacion_activa_unica ON asignaciones_rol');
        DB::statement('ALTER TABLE asignaciones_rol DROP CONSTRAINT asignaciones_rol_rol_id_foreign');
        DB::statement('DROP INDEX IF EXISTS asignacion_rol_activa_unica');

        Schema::table('asignaciones_rol', function (Blueprint $table): void {
            $table->dropColumn('rol_id');
        });

        Schema::drop('roles');

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX asignacion_rol_activa_unica
            ON asignaciones_rol (
                usuario_id,
                rol,
                (COALESCE(carrera_id, '00000000-0000-0000-0000-000000000000'::uuid))
            )
            WHERE asignacion_rol_activa
        SQL);

        $this->createCoordinatorTriggerWithoutCatalog();
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS asignaciones_rol_coordinacion_activa_unica ON asignaciones_rol');
        DB::statement('DROP INDEX IF EXISTS asignacion_rol_activa_unica');
        DB::statement('ALTER TABLE asignaciones_rol DROP CONSTRAINT IF EXISTS asignaciones_rol_alcance_valido_check');
        DB::statement('ALTER TABLE asignaciones_rol DROP CONSTRAINT IF EXISTS asignaciones_rol_rol_valido_check');

        Schema::create('roles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('codigo_rol', 40)->unique();
            $table->string('nombre_rol', 80);
        });

        $roleIds = [];
        foreach (self::ROLES as $code => $name) {
            $roleIds[$code] = (string) Str::uuid();
            DB::table('roles')->insert([
                'id' => $roleIds[$code],
                'codigo_rol' => $code,
                'nombre_rol' => $name,
            ]);
        }

        Schema::table('asignaciones_rol', function (Blueprint $table): void {
            $table->uuid('rol_id')->nullable()->after('usuario_id');
        });

        foreach ($roleIds as $code => $id) {
            DB::table('asignaciones_rol')->where('rol', $code)->update(['rol_id' => $id]);
        }

        DB::statement('ALTER TABLE asignaciones_rol ALTER COLUMN rol_id SET NOT NULL');
        Schema::table('asignaciones_rol', function (Blueprint $table): void {
            $table->foreign('rol_id')->references('id')->on('roles')->restrictOnDelete();
            $table->dropColumn('rol');
        });

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX asignacion_rol_activa_unica
            ON asignaciones_rol (
                usuario_id,
                rol_id,
                (COALESCE(carrera_id, '00000000-0000-0000-0000-000000000000'::uuid))
            )
            WHERE asignacion_rol_activa
        SQL);

        $this->createCoordinatorTriggerWithCatalog();
    }

    private function createCoordinatorTriggerWithoutCatalog(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION comprobar_coordinacion_activa_unica() RETURNS trigger AS $$
            BEGIN
                IF NEW.asignacion_rol_activa
                   AND NEW.carrera_id IS NOT NULL
                   AND NEW.rol = 'coordinador'
                   AND EXISTS (
                       SELECT 1
                       FROM asignaciones_rol AS existente
                       INNER JOIN usuarios AS usuario_existente ON usuario_existente.id = existente.usuario_id
                       WHERE existente.carrera_id = NEW.carrera_id
                         AND existente.asignacion_rol_activa
                         AND usuario_existente.usuario_activo
                         AND existente.rol = 'coordinador'
                         AND existente.id <> NEW.id
                   ) THEN
                    RAISE EXCEPTION 'La carrera ya tiene una coordinación activa' USING ERRCODE = '23505';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER asignaciones_rol_coordinacion_activa_unica
            BEFORE INSERT OR UPDATE OF asignacion_rol_activa, carrera_id, rol
            ON asignaciones_rol
            FOR EACH ROW EXECUTE FUNCTION comprobar_coordinacion_activa_unica();
        SQL);
    }

    private function createCoordinatorTriggerWithCatalog(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION comprobar_coordinacion_activa_unica() RETURNS trigger AS $$
            BEGIN
                IF NEW.asignacion_rol_activa
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
                         AND existente.asignacion_rol_activa
                         AND usuario_existente.usuario_activo
                         AND rol_existente.codigo_rol = 'coordinador'
                         AND existente.id <> NEW.id
                   ) THEN
                    RAISE EXCEPTION 'La carrera ya tiene una coordinación activa' USING ERRCODE = '23505';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER asignaciones_rol_coordinacion_activa_unica
            BEFORE INSERT OR UPDATE OF asignacion_rol_activa, carrera_id, rol_id
            ON asignaciones_rol
            FOR EACH ROW EXECUTE FUNCTION comprobar_coordinacion_activa_unica();
        SQL);
    }
};
