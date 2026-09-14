<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('definiciones_campo_malla')) {
            return;
        }

        $customDefinitions = DB::table('definiciones_campo_malla')
            ->whereNull('clave_sistema')
            ->count();
        $storedValues = DB::table('valores_campo_asignatura')->count();

        // No hay conversión segura para una columna inventada ni para datos EAV. La
        // migración se niega a perderlos: hay que modelarlos como atributo fijo antes.
        if ($customDefinitions > 0 || $storedValues > 0) {
            throw new RuntimeException(
                "No se pueden retirar los campos dinámicos: {$customDefinitions} definiciones libres y {$storedValues} valores requieren migración explícita.",
            );
        }

        Schema::dropIfExists('valores_campo_asignatura');
        Schema::dropIfExists('definiciones_campo_malla');
    }

    public function down(): void
    {
        Schema::create('definiciones_campo_malla', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('malla_id')->constrained('mallas')->cascadeOnDelete();
            $table->string('clave', 80);
            $table->string('etiqueta', 120);
            $table->string('tipo', 24);
            $table->string('clave_sistema', 40)->nullable();
            $table->unsignedSmallInteger('posicion')->default(0);
            $table->boolean('visible_en_tarjeta')->default(true);
            $table->boolean('totalizable')->default(false);
            $table->boolean('activo')->default(true);

            $table->unique(['malla_id', 'clave']);
            $table->unique(['malla_id', 'clave_sistema']);
            $table->index(['malla_id', 'posicion']);
        });

        Schema::create('valores_campo_asignatura', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('asignatura_id')->constrained('asignaturas')->cascadeOnDelete();
            $table->foreignUuid('definicion_campo_id')->constrained('definiciones_campo_malla')->cascadeOnDelete();
            $table->jsonb('valor')->nullable();

            $table->unique(['asignatura_id', 'definicion_campo_id']);
        });

        DB::statement("ALTER TABLE definiciones_campo_malla ADD CONSTRAINT campos_malla_tipo_check CHECK (tipo IN ('texto', 'numero', 'entero', 'booleano'))");

        $fixedFields = [
            ['clave' => 'acd', 'etiqueta' => 'ACD', 'tipo' => 'entero', 'clave_sistema' => 'horas_ac', 'posicion' => 1, 'totalizable' => true],
            ['clave' => 'ape', 'etiqueta' => 'APE', 'tipo' => 'entero', 'clave_sistema' => 'horas_pae', 'posicion' => 2, 'totalizable' => true],
            ['clave' => 'aa', 'etiqueta' => 'AA', 'tipo' => 'entero', 'clave_sistema' => 'horas_aa', 'posicion' => 3, 'totalizable' => true],
            ['clave' => 'cred', 'etiqueta' => 'CRED', 'tipo' => 'numero', 'clave_sistema' => 'creditos', 'posicion' => 4, 'totalizable' => true],
            ['clave' => 'total', 'etiqueta' => 'TOTAL', 'tipo' => 'entero', 'clave_sistema' => 'horas_totales', 'posicion' => 5, 'totalizable' => true],
        ];

        foreach (DB::table('mallas')->pluck('id') as $curriculumId) {
            foreach ($fixedFields as $field) {
                DB::table('definiciones_campo_malla')->insert([
                    'id' => (string) Str::uuid(),
                    'malla_id' => $curriculumId,
                    ...$field,
                    'visible_en_tarjeta' => true,
                    'activo' => true,
                ]);
            }
        }
    }
};
