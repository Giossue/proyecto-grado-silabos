<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * I-48: el producto usa la estructura Facultad -> Carrera.
 *
 * `escuelas` provenía de la fuente SIANET pero no representa una entidad operativa ni
 * una ubicación física en el sistema de sílabos. Campus conserva ese último papel.
 *
 * Es irreversible: los registros de escuelas solo se recuperan desde el respaldo previo.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE carreras DROP CONSTRAINT IF EXISTS carreras_escuela_facultad_fk');
        DB::statement('DROP INDEX IF EXISTS carreras_escuela_id_index');

        Schema::table('carreras', function (Blueprint $table): void {
            $table->dropColumn('escuela_id');
        });

        Schema::dropIfExists('escuelas');
    }

    public function down(): void
    {
        throw new RuntimeException(
            'La migración elimina la estructura de escuelas. Restaure el respaldo previo si necesita recuperarla.',
        );
    }
};
