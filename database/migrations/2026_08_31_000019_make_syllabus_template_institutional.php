<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plantillas_silabo', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('carrera_id');
            $table->boolean('es_institucional')->default(false)->index();
        });

        // Los registros previos se conservan como históricos. La restricción protege la
        // única plantilla institucional que puede usarse en nuevas convocatorias.
        DB::statement(
            'CREATE UNIQUE INDEX plantillas_silabo_una_institucional ON plantillas_silabo (es_institucional) WHERE es_institucional',
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS plantillas_silabo_una_institucional');

        Schema::table('plantillas_silabo', function (Blueprint $table): void {
            $table->dropIndex(['es_institucional']);
            $table->dropColumn('es_institucional');
            $table->foreignUuid('carrera_id')->nullable()->constrained('carreras')->restrictOnDelete();
        });
    }
};
