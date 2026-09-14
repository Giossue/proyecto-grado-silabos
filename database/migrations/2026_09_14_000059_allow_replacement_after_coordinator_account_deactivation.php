<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** La cuenta inactiva conserva historial de rol, pero no bloquea una coordinación nueva. */
    public function up(): void
    {
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

    public function down(): void
    {
        // La migración 000058 conserva la versión base de la función al revertir 000059.
    }
};
