<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Renombra a español las columnas de `usuarios` heredadas del starter (I-28).
 *
 * El modelo `App\Models\User` declara los puentes que Laravel y Fortify necesitan
 * ($authPasswordName, $rememberTokenName, overrides de correo/verificación y accessors
 * para los atributos `two_factor_*` que Fortify fija internamente).
 */
return new class extends Migration
{
    private const RENOMBRES = [
        'name' => 'nombre',
        'email' => 'correo_electronico',
        'email_verified_at' => 'correo_verificado_en',
        'password' => 'contrasena',
        'active' => 'activo',
        'deactivated_at' => 'desactivado_en',
        'remember_token' => 'codigo_recordarme',
        'two_factor_secret' => 'secreto_dos_factores',
        'two_factor_recovery_codes' => 'codigos_recuperacion_dos_factores',
        'two_factor_confirmed_at' => 'dos_factores_confirmado_en',
        'must_change_password' => 'debe_cambiar_contrasena',
        'created_at' => 'creado_en',
        'updated_at' => 'actualizado_en',
    ];

    public function up(): void
    {
        foreach (self::RENOMBRES as $anterior => $nuevo) {
            DB::statement("ALTER TABLE usuarios RENAME COLUMN {$anterior} TO {$nuevo}");
        }

        DB::statement('ALTER INDEX usuarios_email_unique RENAME TO usuarios_correo_electronico_unique');
        DB::statement('ALTER INDEX usuarios_active_index RENAME TO usuarios_activo_index');
    }

    public function down(): void
    {
        DB::statement('ALTER INDEX usuarios_activo_index RENAME TO usuarios_active_index');
        DB::statement('ALTER INDEX usuarios_correo_electronico_unique RENAME TO usuarios_email_unique');

        foreach (array_flip(self::RENOMBRES) as $nuevo => $anterior) {
            DB::statement("ALTER TABLE usuarios RENAME COLUMN {$nuevo} TO {$anterior}");
        }
    }
};
