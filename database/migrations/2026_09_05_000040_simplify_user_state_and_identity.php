<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * I-50: el estado actual de la cuenta es `activo`; el historial vive en auditoría.
 *
 * La cédula era procedencia de una integración SIANET retirada y nunca participa en
 * autenticación, autorización ni operaciones académicas. La eliminación es
 * irreversible: un respaldo lógico previo conserva los valores históricos si se
 * requieren fuera del producto.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('DROP INDEX IF EXISTS usuarios_documento_identidad_unico');

        Schema::table('usuarios', function (Blueprint $table): void {
            $table->dropColumn([
                'desactivado_en',
                'documento_identidad',
                'actualizado_en',
            ]);
        });
    }

    public function down(): void
    {
        throw new RuntimeException('La migración I-50 elimina datos y no admite reversión automática. Restaure el respaldo previo.');
    }
};
