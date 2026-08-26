<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS btree_gist');

        Schema::create('roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codigo', 40)->unique();
            $table->string('nombre', 80);
            $table->timestampsTz();
        });

        Schema::create('facultades', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codigo_institucional', 80)->nullable()->unique();
            $table->string('nombre', 180);
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();
        });

        Schema::create('campus', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codigo_institucional', 80)->nullable()->unique();
            $table->string('nombre', 120);
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();
        });

        Schema::create('modalidades', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codigo', 40)->unique();
            $table->string('nombre', 100);
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();
        });

        Schema::create('periodos_academicos', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codigo', 40)->unique();
            $table->string('nombre', 120);
            $table->date('fecha_inicio');
            $table->date('fecha_fin');
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();
        });

        Schema::create('carreras', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('facultad_id')->constrained('facultades')->restrictOnDelete();
            $table->string('codigo_institucional', 80)->nullable()->unique();
            $table->string('nombre', 180);
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();
        });

        Schema::create('asignaciones_rol', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('rol_id')->constrained('roles')->restrictOnDelete();
            $table->foreignUuid('carrera_id')->nullable()->constrained('carreras')->restrictOnDelete();
            $table->timestampTz('vigente_desde');
            $table->timestampTz('vigente_hasta')->nullable();
            $table->boolean('activo')->default(true);
            $table->timestampsTz();

            $table->unique(['usuario_id', 'rol_id', 'carrera_id', 'vigente_desde'], 'asignacion_rol_identidad_unica');
            $table->index(['usuario_id', 'activo', 'vigente_desde', 'vigente_hasta'], 'asignacion_rol_vigencia_idx');
        });

        Schema::create('asignaciones_coordinador', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('carrera_id')->constrained('carreras')->restrictOnDelete();
            $table->timestampTz('vigente_desde');
            $table->timestampTz('vigente_hasta')->nullable();
            $table->boolean('activo')->default(true);
            $table->timestampsTz();

            $table->index(['carrera_id', 'activo']);
        });

        Schema::create('versiones_malla', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('carrera_id')->constrained('carreras')->restrictOnDelete();
            $table->string('codigo', 80);
            $table->unsignedSmallInteger('numero_version');
            $table->string('estado', 24)->default('draft');
            $table->timestampTz('publicado_en')->nullable();
            $table->timestampsTz();

            $table->unique(['carrera_id', 'numero_version']);
            $table->unique(['carrera_id', 'codigo']);
        });

        Schema::create('asignaturas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('version_malla_id')->constrained('versiones_malla')->restrictOnDelete();
            $table->string('codigo_institucional', 80);
            $table->string('nombre', 180);
            $table->unsignedSmallInteger('nivel')->nullable();
            $table->decimal('creditos', 6, 2)->nullable();
            $table->unsignedSmallInteger('horas_totales')->nullable();
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();

            $table->unique(['version_malla_id', 'codigo_institucional']);
        });

        Schema::create('requisitos_asignatura', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('asignatura_id')->constrained('asignaturas')->restrictOnDelete();
            $table->foreignUuid('requisito_id')->constrained('asignaturas')->restrictOnDelete();
            $table->string('tipo', 30)->default('prerequisite');
            $table->timestampsTz();

            $table->unique(['asignatura_id', 'requisito_id', 'tipo']);
        });

        Schema::create('ofertas_academicas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('periodo_academico_id')->constrained('periodos_academicos')->restrictOnDelete();
            $table->foreignUuid('asignatura_id')->constrained('asignaturas')->restrictOnDelete();
            $table->foreignUuid('campus_id')->constrained('campus')->restrictOnDelete();
            $table->foreignUuid('modalidad_id')->constrained('modalidades')->restrictOnDelete();
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();

            $table->unique(
                ['periodo_academico_id', 'asignatura_id', 'campus_id', 'modalidad_id'],
                'oferta_academica_identidad_unica',
            );
        });

        Schema::create('paralelos', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('oferta_academica_id')->constrained('ofertas_academicas')->restrictOnDelete();
            $table->string('codigo', 30);
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();

            $table->unique(['oferta_academica_id', 'codigo']);
        });

        Schema::create('asignaciones_docente', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('paralelo_id')->constrained('paralelos')->restrictOnDelete();
            $table->timestampTz('vigente_desde');
            $table->timestampTz('vigente_hasta')->nullable();
            $table->boolean('activo')->default(true);
            $table->timestampsTz();

            $table->unique(['usuario_id', 'paralelo_id', 'vigente_desde'], 'asignacion_docente_identidad_unica');
            $table->index(['usuario_id', 'activo', 'vigente_desde', 'vigente_hasta'], 'asignacion_docente_vigencia_idx');
        });

        Schema::create('eventos_auditoria', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('actor_usuario_id')->nullable()->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('asignacion_rol_id')->nullable()->constrained('asignaciones_rol')->restrictOnDelete();
            $table->string('accion', 120);
            $table->string('tipo_recurso', 120);
            $table->uuid('recurso_id')->nullable();
            $table->string('resultado', 24);
            $table->jsonb('contexto')->nullable();
            $table->uuid('correlation_id')->nullable()->index();
            $table->timestampTz('ocurrido_en')->index();
            $table->timestampTz('created_at');

            $table->index(['tipo_recurso', 'recurso_id', 'ocurrido_en'], 'auditoria_recurso_fecha_idx');
            $table->index(['actor_usuario_id', 'ocurrido_en'], 'auditoria_actor_fecha_idx');
        });

        DB::statement('ALTER TABLE periodos_academicos ADD CONSTRAINT periodos_fechas_check CHECK (fecha_fin >= fecha_inicio)');
        DB::statement('ALTER TABLE asignaciones_rol ADD CONSTRAINT asignaciones_rol_vigencia_check CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)');
        DB::statement('ALTER TABLE asignaciones_coordinador ADD CONSTRAINT asignaciones_coordinador_vigencia_check CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)');
        DB::statement('ALTER TABLE asignaciones_docente ADD CONSTRAINT asignaciones_docente_vigencia_check CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)');
        DB::statement("ALTER TABLE versiones_malla ADD CONSTRAINT versiones_malla_estado_check CHECK (estado IN ('draft', 'published', 'inactive'))");
        DB::statement('ALTER TABLE requisitos_asignatura ADD CONSTRAINT requisitos_asignatura_distintos_check CHECK (asignatura_id <> requisito_id)');
        DB::statement("ALTER TABLE eventos_auditoria ADD CONSTRAINT eventos_auditoria_resultado_check CHECK (resultado IN ('success', 'denied', 'failed'))");
        DB::statement("ALTER TABLE asignaciones_coordinador ADD CONSTRAINT coordinador_sin_solapamiento EXCLUDE USING gist (carrera_id WITH =, tstzrange(vigente_desde, COALESCE(vigente_hasta, 'infinity'::timestamptz), '[)') WITH &&) WHERE (activo)");
    }

    public function down(): void
    {
        Schema::dropIfExists('eventos_auditoria');
        Schema::dropIfExists('asignaciones_docente');
        Schema::dropIfExists('paralelos');
        Schema::dropIfExists('ofertas_academicas');
        Schema::dropIfExists('requisitos_asignatura');
        Schema::dropIfExists('asignaturas');
        Schema::dropIfExists('versiones_malla');
        Schema::dropIfExists('asignaciones_coordinador');
        Schema::dropIfExists('asignaciones_rol');
        Schema::dropIfExists('carreras');
        Schema::dropIfExists('periodos_academicos');
        Schema::dropIfExists('modalidades');
        Schema::dropIfExists('campus');
        Schema::dropIfExists('facultades');
        Schema::dropIfExists('roles');
    }
};
