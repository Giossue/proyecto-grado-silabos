<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Las modalidades las fija el Reglamento de Régimen Académico (presencial,
 * semipresencial, en línea, a distancia; híbrida es la combinación): dejan de ser un
 * catálogo editable y pasan a una columna de texto con valores fijos en carrera,
 * materia y oferta. Lo existente se traduce por el nombre del catálogo (I-37).
 */
return new class extends Migration
{
    private const TABLES = ['carreras', 'asignaturas', 'ofertas_academicas'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->string('modalidad', 20)->nullable()->after('modalidad_id');
            });
            DB::statement(<<<SQL
                UPDATE {$table} AS t SET modalidad = CASE
                    WHEN lower(m.nombre) LIKE '%semipresencial%' THEN 'semipresencial'
                    WHEN lower(m.nombre) LIKE '%distancia%' THEN 'a_distancia'
                    WHEN lower(m.nombre) LIKE '%nea%' OR lower(m.nombre) LIKE '%virtual%' THEN 'en_linea'
                    ELSE 'presencial'
                END
                FROM modalidades AS m WHERE m.id = t.modalidad_id
            SQL);
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->dropConstrainedForeignId('modalidad_id');
            });
        }
        // La oferta siempre se dicta de alguna forma; lo que no tenía catálogo se asume presencial.
        DB::table('ofertas_academicas')->whereNull('modalidad')->update(['modalidad' => 'presencial']);
        Schema::table('ofertas_academicas', function (Blueprint $blueprint): void {
            $blueprint->string('modalidad', 20)->nullable(false)->change();
        });
        Schema::dropIfExists('modalidades');
    }

    public function down(): void
    {
        Schema::create('modalidades', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('codigo', 40)->unique();
            $table->string('nombre', 100);
            $table->boolean('combina_por_asignatura')->default(false);
            $table->boolean('activo')->default(true);
            $table->timestamp('creado_en')->nullable();
            $table->timestamp('actualizado_en')->nullable();
        });
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->foreignUuid('modalidad_id')->nullable()->constrained('modalidades')->restrictOnDelete();
                $blueprint->dropColumn('modalidad');
            });
        }
    }
};
