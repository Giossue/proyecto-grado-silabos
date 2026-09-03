<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cada facultad tiene su logo, que encabeza el sílabo de las carreras que le
 * pertenecen (junto al logo de la universidad). La imagen vive en el disco privado
 * y aquí solo se guarda su ruta; es obligatoria al crear la facultad (I-34).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facultades', function (Blueprint $table): void {
            $table->string('logo_ruta', 255)->nullable()->after('nombre');
        });
    }

    public function down(): void
    {
        Schema::table('facultades', function (Blueprint $table): void {
            $table->dropColumn('logo_ruta');
        });
    }
};
