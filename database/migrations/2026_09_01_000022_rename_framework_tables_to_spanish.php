<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Renombra a español las tablas de framework que sí están en uso (I-28):
 * `sessions` → `sesiones`, `failed_jobs` → `trabajos_fallidos` y
 * `password_reset_tokens` → `restablecimientos_contrasena`. Los nombres nuevos se fijan
 * en `config/session.php`, `config/queue.php` y `config/auth.php`.
 *
 * Las columnas internas de estas tablas las escriben los drivers de Laravel con nombres
 * fijos y se conservan (límite registrado en deuda técnica). PostgreSQL no renombra
 * índices, constraints ni secuencias junto con la tabla, así que se renombran aparte.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE sessions RENAME TO sesiones');
        DB::statement('ALTER INDEX sessions_pkey RENAME TO sesiones_pkey');
        DB::statement('ALTER INDEX sessions_last_activity_index RENAME TO sesiones_last_activity_index');
        DB::statement('ALTER TABLE sesiones RENAME CONSTRAINT sessions_user_id_foreign TO sesiones_user_id_foreign');

        DB::statement('ALTER TABLE failed_jobs RENAME TO trabajos_fallidos');
        DB::statement('ALTER INDEX failed_jobs_pkey RENAME TO trabajos_fallidos_pkey');
        DB::statement('ALTER INDEX failed_jobs_uuid_unique RENAME TO trabajos_fallidos_uuid_unique');
        DB::statement('ALTER INDEX failed_jobs_connection_queue_failed_at_index RENAME TO trabajos_fallidos_connection_queue_failed_at_index');
        DB::statement('ALTER SEQUENCE IF EXISTS failed_jobs_id_seq RENAME TO trabajos_fallidos_id_seq');

        DB::statement('ALTER TABLE password_reset_tokens RENAME TO restablecimientos_contrasena');
        DB::statement('ALTER INDEX password_reset_tokens_pkey RENAME TO restablecimientos_contrasena_pkey');
    }

    public function down(): void
    {
        DB::statement('ALTER INDEX restablecimientos_contrasena_pkey RENAME TO password_reset_tokens_pkey');
        DB::statement('ALTER TABLE restablecimientos_contrasena RENAME TO password_reset_tokens');

        DB::statement('ALTER SEQUENCE IF EXISTS trabajos_fallidos_id_seq RENAME TO failed_jobs_id_seq');
        DB::statement('ALTER INDEX trabajos_fallidos_connection_queue_failed_at_index RENAME TO failed_jobs_connection_queue_failed_at_index');
        DB::statement('ALTER INDEX trabajos_fallidos_uuid_unique RENAME TO failed_jobs_uuid_unique');
        DB::statement('ALTER INDEX trabajos_fallidos_pkey RENAME TO failed_jobs_pkey');
        DB::statement('ALTER TABLE trabajos_fallidos RENAME TO failed_jobs');

        DB::statement('ALTER TABLE sesiones RENAME CONSTRAINT sesiones_user_id_foreign TO sessions_user_id_foreign');
        DB::statement('ALTER INDEX sesiones_last_activity_index RENAME TO sessions_last_activity_index');
        DB::statement('ALTER INDEX sesiones_pkey RENAME TO sessions_pkey');
        DB::statement('ALTER TABLE sesiones RENAME TO sessions');
    }
};
