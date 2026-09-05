<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('plantillas_silabo')->count() > 1) {
            throw new RuntimeException('Existe más de una plantilla de sílabo; consolídelas antes de migrar.');
        }

        DB::statement('DROP INDEX IF EXISTS plantillas_silabo_una_institucional');

        Schema::table('plantillas_silabo', function (Blueprint $table): void {
            $table->dropIndex(['es_institucional']);
            $table->dropColumn('es_institucional');
        });

        DB::statement('CREATE UNIQUE INDEX plantillas_silabo_unica ON plantillas_silabo ((TRUE))');
    }

    public function down(): void
    {
        throw new RuntimeException('I-52 elimina una columna redundante y no admite reversión automática. Restaure el respaldo previo.');
    }
};
