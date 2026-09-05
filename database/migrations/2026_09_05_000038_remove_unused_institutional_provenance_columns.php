<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * I-47: retira metadatos de procedencia SIANET que no participan en el producto.
 *
 * La integración institucional fue retirada y el sistema trabaja con sus identificadores
 * operativos: código visible de materia, código de período y código de malla. Estos
 * campos no se leen ni escriben desde los casos de uso actuales.
 *
 * Es irreversible: los valores eliminados solo pueden recuperarse desde el respaldo
 * tomado antes de ejecutarla.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE escuelas DROP CONSTRAINT IF EXISTS escuelas_codigo_institucional_unique');
        DB::statement('DROP INDEX IF EXISTS periodos_codigo_institucional_unico');
        DB::statement('DROP INDEX IF EXISTS mallas_codigo_institucional_unico');
        DB::statement('DROP INDEX IF EXISTS asignaturas_codigo_oculto_unico');
        DB::statement('DROP INDEX IF EXISTS asignaciones_docente_codigo_institucional_unico');

        Schema::table('escuelas', function (Blueprint $table): void {
            $table->dropColumn('codigo_institucional');
        });
        Schema::table('periodos_academicos', function (Blueprint $table): void {
            $table->dropColumn(['codigo_institucional', 'anio']);
        });
        Schema::table('mallas', function (Blueprint $table): void {
            $table->dropColumn(['codigo_institucional', 'descripcion']);
        });
        Schema::table('asignaturas', function (Blueprint $table): void {
            $table->dropColumn('codigo_oculto_institucional');
        });
        Schema::table('asignaciones_docente', function (Blueprint $table): void {
            $table->dropColumn('codigo_institucional');
        });
    }

    public function down(): void
    {
        throw new RuntimeException(
            'La migración elimina datos de procedencia institucional. Restaure el respaldo previo si necesita recuperarlos.',
        );
    }
};
