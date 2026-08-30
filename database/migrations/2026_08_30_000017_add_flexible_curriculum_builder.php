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
        Schema::table('versiones_malla', function (Blueprint $table) {
            $table->unsignedSmallInteger('numero_ciclos')->default(8)->after('numero_version');
        });

        Schema::table('asignaturas', function (Blueprint $table) {
            $table->unsignedSmallInteger('orden_en_ciclo')->default(0)->after('ciclo');
            $table->string('unidad_organizacion_curricular', 80)->nullable()->after('orden_en_ciclo');
        });

        Schema::create('definiciones_campo_malla', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('version_malla_id')->constrained('versiones_malla')->cascadeOnDelete();
            $table->string('clave', 80);
            $table->string('etiqueta', 120);
            $table->string('tipo', 24);
            $table->string('clave_sistema', 40)->nullable();
            $table->unsignedSmallInteger('posicion')->default(0);
            $table->boolean('visible_en_tarjeta')->default(true);
            $table->boolean('totalizable')->default(false);
            $table->boolean('activo')->default(true);
            $table->timestampsTz();

            $table->unique(['version_malla_id', 'clave']);
            $table->unique(['version_malla_id', 'clave_sistema']);
            $table->index(['version_malla_id', 'posicion']);
        });

        Schema::create('valores_campo_asignatura', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('asignatura_id')->constrained('asignaturas')->cascadeOnDelete();
            $table->foreignUuid('definicion_campo_id')->constrained('definiciones_campo_malla')->cascadeOnDelete();
            $table->jsonb('valor')->nullable();
            $table->timestampsTz();

            $table->unique(['asignatura_id', 'definicion_campo_id']);
        });

        DB::statement('ALTER TABLE versiones_malla ADD CONSTRAINT versiones_malla_numero_ciclos_check CHECK (numero_ciclos BETWEEN 1 AND 30)');
        DB::statement("ALTER TABLE definiciones_campo_malla ADD CONSTRAINT campos_malla_tipo_check CHECK (tipo IN ('text', 'number', 'integer', 'boolean'))");

        $defaults = [
            ['clave' => 'acd', 'etiqueta' => 'ACD', 'tipo' => 'integer', 'clave_sistema' => 'hours_ac', 'posicion' => 1, 'totalizable' => true],
            ['clave' => 'ape', 'etiqueta' => 'APE', 'tipo' => 'integer', 'clave_sistema' => 'hours_pae', 'posicion' => 2, 'totalizable' => true],
            ['clave' => 'aa', 'etiqueta' => 'AA', 'tipo' => 'integer', 'clave_sistema' => 'hours_aa', 'posicion' => 3, 'totalizable' => true],
            ['clave' => 'cred', 'etiqueta' => 'CRED', 'tipo' => 'number', 'clave_sistema' => 'credits', 'posicion' => 4, 'totalizable' => true],
            ['clave' => 'total', 'etiqueta' => 'TOTAL', 'tipo' => 'integer', 'clave_sistema' => 'total_hours', 'posicion' => 5, 'totalizable' => true],
        ];

        foreach (DB::table('versiones_malla')->pluck('id') as $curriculumId) {
            foreach ($defaults as $default) {
                DB::table('definiciones_campo_malla')->insert([
                    'id' => (string) Str::uuid(),
                    'version_malla_id' => $curriculumId,
                    ...$default,
                    'visible_en_tarjeta' => true,
                    'activo' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('valores_campo_asignatura');
        Schema::dropIfExists('definiciones_campo_malla');

        Schema::table('asignaturas', function (Blueprint $table) {
            $table->dropColumn(['orden_en_ciclo', 'unidad_organizacion_curricular']);
        });

        Schema::table('versiones_malla', function (Blueprint $table) {
            $table->dropColumn('numero_ciclos');
        });
    }
};
