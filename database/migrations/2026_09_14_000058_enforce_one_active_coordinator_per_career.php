<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `asignaciones_rol` es genérica: docentes pueden repetirse por carrera, pero una
     * carrera solo puede tener una coordinación activa. PostgreSQL no permite un índice
     * parcial que dependa de `roles.codigo`, por lo que la invariante se protege con un
     * trigger sobre la tabla normalizada.
     */
    public function up(): void
    {
        $duplicates = DB::selectOne(<<<'SQL'
            SELECT carrera_id
            FROM asignaciones_rol AS asignacion
            INNER JOIN roles AS rol ON rol.id = asignacion.rol_id
            WHERE asignacion.activo
              AND asignacion.carrera_id IS NOT NULL
              AND rol.codigo = 'coordinador'
            GROUP BY carrera_id
            HAVING COUNT(*) > 1
            LIMIT 1
        SQL);
        if ($duplicates !== null) {
            throw new RuntimeException('No se puede aplicar la regla de coordinación: hay más de un coordinador activo en una carrera.');
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

            DROP TRIGGER IF EXISTS asignaciones_rol_coordinacion_activa_unica ON asignaciones_rol;

            CREATE TRIGGER asignaciones_rol_coordinacion_activa_unica
            BEFORE INSERT OR UPDATE OF activo, carrera_id, rol_id
            ON asignaciones_rol
            FOR EACH ROW
            EXECUTE FUNCTION comprobar_coordinacion_activa_unica();
        SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            DROP TRIGGER IF EXISTS asignaciones_rol_coordinacion_activa_unica ON asignaciones_rol;
            DROP FUNCTION IF EXISTS comprobar_coordinacion_activa_unica();
        SQL);
    }
};
