<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE usuarios RENAME COLUMN nombre TO nombre_usuario');
        DB::statement('ALTER TABLE usuarios RENAME COLUMN activo TO usuario_activo');
        DB::statement('ALTER INDEX usuarios_activo_index RENAME TO usuarios_usuario_activo_index');

        $this->redefineCoordinatorConstraint('asignacion_rol_activa', 'usuario_activo');
    }

    public function down(): void
    {
        DB::statement('ALTER INDEX usuarios_usuario_activo_index RENAME TO usuarios_activo_index');
        DB::statement('ALTER TABLE usuarios RENAME COLUMN usuario_activo TO activo');
        DB::statement('ALTER TABLE usuarios RENAME COLUMN nombre_usuario TO nombre');

        $this->redefineCoordinatorConstraint('activo', 'activo');
    }

    private function redefineCoordinatorConstraint(string $roleAssignmentActiveColumn, string $userActiveColumn): void
    {
        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION comprobar_coordinacion_activa_unica() RETURNS trigger AS $$
            BEGIN
                IF NEW.{$roleAssignmentActiveColumn}
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
                         AND existente.{$roleAssignmentActiveColumn}
                         AND usuario_existente.{$userActiveColumn}
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
