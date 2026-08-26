<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campanias', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('carrera_id')->constrained('carreras')->restrictOnDelete();
            $table->foreignUuid('periodo_academico_id')->constrained('periodos_academicos')->restrictOnDelete();
            $table->foreignUuid('version_plantilla_id')->constrained('versiones_plantilla')->restrictOnDelete();
            $table->string('nombre', 180);
            $table->string('estado', 24)->default('preparation');
            $table->string('modo_agrupacion', 24);
            $table->foreignUuid('creado_por')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('abierto_por')->nullable()->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('abierto_en')->nullable();
            $table->timestampTz('cerrado_en')->nullable();
            $table->timestampsTz();

            $table->unique(['carrera_id', 'periodo_academico_id', 'nombre']);
            $table->index(['carrera_id', 'estado']);
        });

        Schema::create('fuentes_campania', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('campania_id')->constrained('campanias')->cascadeOnDelete();
            $table->foreignUuid('version_fuente_id')->constrained('versiones_fuente')->restrictOnDelete();
            $table->timestampsTz();

            $table->unique(['campania_id', 'version_fuente_id']);
        });

        Schema::create('fechas_limite_campania', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('campania_id')->constrained('campanias')->cascadeOnDelete();
            $table->string('etapa', 40);
            $table->timestampTz('vence_en');
            $table->timestampsTz();

            $table->unique(['campania_id', 'etapa']);
        });

        Schema::create('silabos', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('campania_id')->constrained('campanias')->restrictOnDelete();
            $table->foreignUuid('asignatura_id')->constrained('asignaturas')->restrictOnDelete();
            $table->foreignUuid('version_malla_id')->constrained('versiones_malla')->restrictOnDelete();
            $table->foreignUuid('version_plantilla_id')->constrained('versiones_plantilla')->restrictOnDelete();
            $table->string('estado', 32)->default('not_started');
            $table->unsignedInteger('lock_version')->default(0);
            $table->decimal('porcentaje_completitud', 5, 2)->default(0);
            $table->timestampTz('iniciado_en')->nullable();
            $table->timestampTz('guardado_en')->nullable();
            $table->timestampsTz();

            $table->index(['campania_id', 'estado']);
            $table->index(['asignatura_id', 'estado']);
        });

        Schema::create('alcances_silabo', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->cascadeOnDelete();
            $table->foreignUuid('campania_id')->constrained('campanias')->restrictOnDelete();
            $table->foreignUuid('oferta_academica_id')->constrained('ofertas_academicas')->restrictOnDelete();
            $table->foreignUuid('paralelo_id')->constrained('paralelos')->restrictOnDelete();
            $table->timestampsTz();

            $table->unique(['silabo_id', 'paralelo_id']);
            $table->unique(['campania_id', 'paralelo_id']);
        });

        Schema::create('colaboradores_silabo', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->cascadeOnDelete();
            $table->foreignUuid('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('asignacion_docente_id')->constrained('asignaciones_docente')->restrictOnDelete();
            $table->timestampsTz();

            $table->unique(['silabo_id', 'asignacion_docente_id']);
            $table->index(['usuario_id', 'silabo_id']);
        });

        Schema::create('valores_campo', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->cascadeOnDelete();
            $table->foreignUuid('definicion_campo_id')->constrained('definiciones_campo')->restrictOnDelete();
            $table->jsonb('valor')->nullable();
            $table->boolean('heredado')->default(false);
            $table->string('origen', 120)->nullable();
            $table->timestampsTz();

            $table->unique(['silabo_id', 'definicion_campo_id']);
        });

        Schema::create('filas_repetibles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->cascadeOnDelete();
            $table->foreignUuid('definicion_campo_id')->constrained('definiciones_campo')->restrictOnDelete();
            $table->jsonb('datos');
            $table->unsignedSmallInteger('posicion');
            $table->timestampsTz();

            $table->unique(['silabo_id', 'definicion_campo_id', 'posicion'], 'fila_repetible_posicion_unica');
            $table->index(['silabo_id', 'definicion_campo_id']);
        });

        Schema::create('ejecuciones_validacion', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->cascadeOnDelete();
            $table->foreignUuid('ejecutado_por')->constrained('usuarios')->restrictOnDelete();
            $table->string('version_reglas', 40);
            $table->string('estado', 24);
            $table->unsignedInteger('lock_version');
            $table->unsignedSmallInteger('errores_bloqueantes')->default(0);
            $table->unsignedSmallInteger('advertencias')->default(0);
            $table->decimal('porcentaje_completitud', 5, 2);
            $table->timestampTz('completado_en');
            $table->timestampsTz();

            $table->index(['silabo_id', 'completado_en']);
        });

        Schema::create('resultados_validacion', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('ejecucion_validacion_id')->constrained('ejecuciones_validacion')->cascadeOnDelete();
            $table->foreignUuid('definicion_campo_id')->nullable()->constrained('definiciones_campo')->restrictOnDelete();
            $table->string('codigo', 80);
            $table->string('severidad', 20);
            $table->string('mensaje', 500);
            $table->timestampsTz();

            $table->index(['ejecucion_validacion_id', 'severidad']);
        });

        DB::statement("ALTER TABLE campanias ADD CONSTRAINT campanias_estado_check CHECK (estado IN ('preparation', 'open', 'closed'))");
        DB::statement("ALTER TABLE campanias ADD CONSTRAINT campanias_agrupacion_check CHECK (modo_agrupacion IN ('per_offering', 'per_parallel'))");
        DB::statement("ALTER TABLE fechas_limite_campania ADD CONSTRAINT fechas_limite_etapa_check CHECK (etapa IN ('draft', 'review', 'correction'))");
        DB::statement("ALTER TABLE silabos ADD CONSTRAINT silabos_estado_check CHECK (estado IN ('not_started', 'draft', 'in_review', 'correction_requested', 'approved'))");
        DB::statement('ALTER TABLE silabos ADD CONSTRAINT silabos_completitud_check CHECK (porcentaje_completitud BETWEEN 0 AND 100)');
        DB::statement("ALTER TABLE ejecuciones_validacion ADD CONSTRAINT ejecuciones_validacion_estado_check CHECK (estado IN ('completed', 'failed'))");
        DB::statement("ALTER TABLE resultados_validacion ADD CONSTRAINT resultados_validacion_severidad_check CHECK (severidad IN ('error', 'warning'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('resultados_validacion');
        Schema::dropIfExists('ejecuciones_validacion');
        Schema::dropIfExists('filas_repetibles');
        Schema::dropIfExists('valores_campo');
        Schema::dropIfExists('colaboradores_silabo');
        Schema::dropIfExists('alcances_silabo');
        Schema::dropIfExists('silabos');
        Schema::dropIfExists('fechas_limite_campania');
        Schema::dropIfExists('fuentes_campania');
        Schema::dropIfExists('campanias');
    }
};
