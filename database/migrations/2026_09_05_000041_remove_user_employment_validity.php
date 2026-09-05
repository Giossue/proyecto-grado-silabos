<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * I-51: una cuenta no tiene un intervalo laboral estable; su disponibilidad actual
 * vive en `activo` y en sus asignaciones operativas.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_vigencia_laboral_check');

        Schema::table('usuarios', function (Blueprint $table): void {
            $table->dropColumn(['vigente_desde', 'vigente_hasta']);
        });
    }

    public function down(): void
    {
        throw new RuntimeException('La migración I-51 elimina datos y no admite reversión automática. Restaure el respaldo previo.');
    }
};
