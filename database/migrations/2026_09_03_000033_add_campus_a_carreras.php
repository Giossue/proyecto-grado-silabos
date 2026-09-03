<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El CES aprueba cada carrera para una sede: el campus es de la carrera, como la
 * modalidad, y las ofertas lo heredan en vez de pedirlo cada periodo (I-36).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('carreras', function (Blueprint $table): void {
            $table->foreignUuid('campus_id')->nullable()->after('modalidad_id')
                ->constrained('campus')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('carreras', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('campus_id');
        });
    }
};
