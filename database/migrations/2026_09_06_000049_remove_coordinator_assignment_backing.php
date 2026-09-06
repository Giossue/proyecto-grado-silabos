<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('asignaciones_coordinador', function (Blueprint $table): void {
            $table->dropColumn(['sustento_tipo', 'sustento_numero', 'sustento_fecha']);
        });
    }

    public function down(): void
    {
        throw new RuntimeException('I-52 elimina el sustento documental de coordinaciones y no admite reversión automática. Restaure el respaldo previo.');
    }
};
