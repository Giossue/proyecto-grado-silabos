<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('asignaciones_coordinador', function (Blueprint $table): void {
            $table->dropColumn('calidad');
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Restaure el respaldo previo para recuperar los tipos de designación eliminados (I-52).');
    }
};
