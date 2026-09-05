<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE convocatorias_carreras DROP CONSTRAINT IF EXISTS convocatorias_agrupacion_check');
        Schema::table('convocatorias_carreras', fn (Blueprint $t) => $t->dropColumn('modo_agrupacion'));
    }

    public function down(): void
    {
        throw new RuntimeException('Sin reversión automática.');
    }
};
