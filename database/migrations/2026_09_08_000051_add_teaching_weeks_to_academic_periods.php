<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('periodos_academicos', function (Blueprint $table): void {
            // Los periodos existentes corresponden al formato institucional vigente
            // de 16 semanas. Los nuevos registros deben declarar el valor en la UI.
            $table->unsignedSmallInteger('semanas_lectivas')->default(16)->after('fecha_fin');
        });

        DB::statement('ALTER TABLE periodos_academicos ADD CONSTRAINT periodos_semanas_lectivas_rango CHECK (semanas_lectivas BETWEEN 1 AND 52)');
    }

    public function down(): void
    {
        Schema::table('periodos_academicos', function (Blueprint $table): void {
            $table->dropColumn('semanas_lectivas');
        });
    }
};
