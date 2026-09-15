<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const RENAMES = [
        ['roles', 'codigo', 'codigo_rol'],
        ['roles', 'nombre', 'nombre_rol'],
    ];

    public function up(): void
    {
        foreach (self::RENAMES as [$table, $from, $to]) {
            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$from} TO {$to}");
        }

        DB::statement('ALTER INDEX roles_codigo_unique RENAME TO roles_codigo_rol_unique');

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION comprobar_coordinacion_activa_unica()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                IF NEW.activo
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
                         AND existente.activo
                         AND usuario_existente.activo
                         AND rol_existente.codigo_rol = 'coordinador'
                         AND existente.id <> NEW.id
                   )
                THEN
                    RAISE EXCEPTION 'La carrera ya tiene una coordinación activa'
                        USING ERRCODE = '23505';
                END IF;

                RETURN NEW;
            END;
            $$;
        SQL);
    }

    public function down(): void
    {
        DB::statement('ALTER INDEX roles_codigo_rol_unique RENAME TO roles_codigo_unique');

        foreach (array_reverse(self::RENAMES) as [$table, $from, $to]) {
            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$to} TO {$from}");
        }

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION comprobar_coordinacion_activa_unica()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                IF NEW.activo
                   AND NEW.carrera_id IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM roles
                       WHERE id = NEW.rol_id AND codigo = 'coordinador'
                   )
                   AND EXISTS (
                       SELECT 1
                       FROM asignaciones_rol AS existente
                       INNER JOIN roles AS rol_existente ON rol_existente.id = existente.rol_id
                       INNER JOIN usuarios AS usuario_existente ON usuario_existente.id = existente.usuario_id
                       WHERE existente.carrera_id = NEW.carrera_id
                         AND existente.activo
                         AND usuario_existente.activo
                         AND rol_existente.codigo = 'coordinador'
                         AND existente.id <> NEW.id
                   )
                THEN
                    RAISE EXCEPTION 'La carrera ya tiene una coordinación activa'
                        USING ERRCODE = '23505';
                END IF;

                RETURN NEW;
            END;
            $$;
        SQL);
    }
};
