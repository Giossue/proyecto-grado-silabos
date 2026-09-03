<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * La ficha de identificación del sílabo (formato oficial) pide la jornada del
 * paralelo: matutina, vespertina o nocturna. Es un dato del paralelo, no del
 * expediente, así que vive aquí y la ficha lo lee de la malla (I-34).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('paralelos', function (Blueprint $table): void {
            $table->string('jornada', 20)->nullable()->after('codigo');
        });
        DB::statement("ALTER TABLE paralelos ADD CONSTRAINT paralelos_jornada_check CHECK (jornada IS NULL OR jornada IN ('matutina', 'vespertina', 'nocturna'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE paralelos DROP CONSTRAINT IF EXISTS paralelos_jornada_check');
        Schema::table('paralelos', function (Blueprint $table): void {
            $table->dropColumn('jornada');
        });
    }
};
