<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * La responsabilidad sobre un paralelo no conserva el documento administrativo
     * del relevo. Si alguna instalación aún lo hubiera registrado, se detiene para
     * que se respalde antes de retirar sus columnas.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('docentes_paralelo', 'sustento_tipo')) {
            return;
        }

        $hasBacking = DB::table('docentes_paralelo')
            ->whereNotNull('sustento_tipo')
            ->orWhereNotNull('sustento_numero')
            ->orWhereNotNull('sustento_fecha')
            ->exists();

        if ($hasBacking) {
            throw new RuntimeException(
                'Hay respaldos de relevo en docentes_paralelo. Respalde esos datos antes de retirar las columnas.',
            );
        }

        Schema::table('docentes_paralelo', function (Blueprint $table): void {
            $table->dropColumn(['sustento_tipo', 'sustento_numero', 'sustento_fecha']);
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('docentes_paralelo', 'sustento_tipo')) {
            return;
        }

        Schema::table('docentes_paralelo', function (Blueprint $table): void {
            $table->string('sustento_tipo')->nullable();
            $table->string('sustento_numero')->nullable();
            $table->date('sustento_fecha')->nullable();
        });
    }
};
