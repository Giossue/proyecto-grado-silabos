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
            $table->dropColumn(['nombre', 'activo']);
        });
    }

    public function down(): void
    {
        Schema::table('periodos_academicos', function (Blueprint $table): void {
            $table->string('nombre', 120)->nullable();
            $table->boolean('activo')->default(true);
        });

        DB::table('periodos_academicos')->update([
            'nombre' => DB::raw('codigo'),
            'activo' => true,
        ]);

        DB::statement('ALTER TABLE periodos_academicos ALTER COLUMN nombre SET NOT NULL');
    }
};
