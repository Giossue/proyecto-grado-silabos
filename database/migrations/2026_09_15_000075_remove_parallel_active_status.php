<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('paralelos', 'paralelo_activo')) {
            return;
        }

        Schema::table('paralelos', function (Blueprint $table): void {
            $table->dropColumn('paralelo_activo');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('paralelos', 'paralelo_activo')) {
            return;
        }

        Schema::table('paralelos', function (Blueprint $table): void {
            $table->boolean('paralelo_activo')->default(true);
        });
    }
};
