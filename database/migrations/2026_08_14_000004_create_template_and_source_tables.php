<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plantillas_silabo', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('carrera_id')->nullable()->constrained('carreras')->restrictOnDelete();
            $table->string('nombre', 180);
            $table->text('descripcion')->nullable();
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();
        });

        Schema::create('versiones_plantilla', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('plantilla_id')->constrained('plantillas_silabo')->restrictOnDelete();
            $table->unsignedSmallInteger('numero_version');
            $table->string('estado', 24)->default('draft');
            $table->jsonb('mapeo_documento')->nullable();
            $table->char('huella_sha256', 64)->nullable();
            $table->foreignUuid('publicado_por')->nullable()->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('publicado_en')->nullable();
            $table->timestampsTz();

            $table->unique(['plantilla_id', 'numero_version']);
        });

        Schema::create('secciones_plantilla', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('version_plantilla_id')->constrained('versiones_plantilla')->cascadeOnDelete();
            $table->string('clave', 100);
            $table->string('titulo', 180);
            $table->text('descripcion')->nullable();
            $table->unsignedSmallInteger('posicion');
            $table->timestampsTz();

            $table->unique(['version_plantilla_id', 'clave']);
            $table->unique(['version_plantilla_id', 'posicion']);
        });

        Schema::create('bloques_plantilla', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('version_plantilla_id')->constrained('versiones_plantilla')->cascadeOnDelete();
            $table->foreignUuid('seccion_plantilla_id')->constrained('secciones_plantilla')->cascadeOnDelete();
            $table->string('clave', 100);
            $table->string('tipo', 40);
            $table->string('titulo', 180);
            $table->jsonb('configuracion')->nullable();
            $table->unsignedSmallInteger('posicion');
            $table->timestampsTz();

            $table->unique(['version_plantilla_id', 'clave']);
            $table->unique(['seccion_plantilla_id', 'posicion']);
        });

        Schema::create('definiciones_campo', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('version_plantilla_id')->constrained('versiones_plantilla')->cascadeOnDelete();
            $table->foreignUuid('bloque_plantilla_id')->constrained('bloques_plantilla')->cascadeOnDelete();
            $table->string('clave', 120);
            $table->string('etiqueta', 180);
            $table->text('ayuda')->nullable();
            $table->string('tipo', 40);
            $table->boolean('obligatorio')->default(false);
            $table->boolean('heredado')->default(false);
            $table->string('origen_maestro', 100)->nullable();
            $table->boolean('editable_docente')->default(true);
            $table->boolean('ia_habilitada')->default(false);
            $table->jsonb('reglas')->nullable();
            $table->jsonb('opciones')->nullable();
            $table->string('marcador_documento', 160)->nullable();
            $table->unsignedSmallInteger('posicion');
            $table->timestampsTz();

            $table->unique(['version_plantilla_id', 'clave']);
            $table->unique(['bloque_plantilla_id', 'posicion']);
        });

        Schema::create('fuentes_academicas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('carrera_id')->constrained('carreras')->restrictOnDelete();
            $table->string('nombre', 180);
            $table->string('tipo', 60);
            $table->string('autoridad', 180);
            $table->string('responsable', 180);
            $table->text('descripcion')->nullable();
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();

            $table->unique(['carrera_id', 'nombre']);
        });

        Schema::create('versiones_fuente', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('fuente_academica_id')->constrained('fuentes_academicas')->restrictOnDelete();
            $table->unsignedSmallInteger('numero_version');
            $table->string('estado', 24)->default('draft');
            $table->date('vigente_desde')->nullable();
            $table->date('vigente_hasta')->nullable();
            $table->char('huella_sha256', 64)->nullable();
            $table->foreignUuid('activado_por')->nullable()->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('activado_en')->nullable();
            $table->timestampsTz();

            $table->unique(['fuente_academica_id', 'numero_version']);
        });

        Schema::create('fragmentos_fuente', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('version_fuente_id')->constrained('versiones_fuente')->cascadeOnDelete();
            $table->string('clave', 120);
            $table->string('titulo', 180);
            $table->text('contenido')->nullable();
            $table->string('clave_dato', 160)->nullable();
            $table->jsonb('valor_estructurado')->nullable();
            $table->jsonb('metadatos')->nullable();
            $table->char('huella_sha256', 64);
            $table->unsignedSmallInteger('posicion');
            $table->timestampsTz();

            $table->unique(['version_fuente_id', 'clave']);
            $table->unique(['version_fuente_id', 'posicion']);
            $table->index('clave_dato');
        });

        Schema::create('conflictos_fuente', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('version_candidata_id')->constrained('versiones_fuente')->restrictOnDelete();
            $table->foreignUuid('version_activa_id')->constrained('versiones_fuente')->restrictOnDelete();
            $table->string('clave_dato', 160);
            $table->char('huella_candidata', 64);
            $table->char('huella_activa', 64);
            $table->string('estado', 24)->default('pending');
            $table->string('decision', 24)->nullable();
            $table->text('justificacion')->nullable();
            $table->foreignUuid('resuelto_por')->nullable()->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('resuelto_en')->nullable();
            $table->timestampsTz();

            $table->unique(['version_candidata_id', 'version_activa_id', 'clave_dato'], 'conflicto_fuente_identidad');
        });

        DB::statement("ALTER TABLE versiones_plantilla ADD CONSTRAINT versiones_plantilla_estado_check CHECK (estado IN ('draft', 'published'))");
        DB::statement("ALTER TABLE bloques_plantilla ADD CONSTRAINT bloques_plantilla_tipo_check CHECK (tipo IN ('group', 'fields', 'repeatable', 'narrative', 'workflow'))");
        DB::statement("ALTER TABLE definiciones_campo ADD CONSTRAINT definiciones_campo_tipo_check CHECK (tipo IN ('short_text', 'long_text', 'markdown', 'number', 'date', 'single_select', 'multi_select', 'boolean', 'repeatable', 'calculation', 'master_reference'))");
        DB::statement("ALTER TABLE versiones_fuente ADD CONSTRAINT versiones_fuente_estado_check CHECK (estado IN ('draft', 'active', 'superseded'))");
        DB::statement('ALTER TABLE versiones_fuente ADD CONSTRAINT versiones_fuente_vigencia_check CHECK (vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde)');
        DB::statement('ALTER TABLE fragmentos_fuente ADD CONSTRAINT fragmentos_fuente_contenido_check CHECK (contenido IS NOT NULL OR valor_estructurado IS NOT NULL)');
        DB::statement("ALTER TABLE conflictos_fuente ADD CONSTRAINT conflictos_fuente_estado_check CHECK (estado IN ('pending', 'resolved'))");
        DB::statement("ALTER TABLE conflictos_fuente ADD CONSTRAINT conflictos_fuente_decision_check CHECK (decision IS NULL OR decision IN ('candidate', 'active'))");
        DB::statement("CREATE UNIQUE INDEX versiones_fuente_activa_unica ON versiones_fuente (fuente_academica_id) WHERE estado = 'active'");

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION proteger_configuracion_publicada() RETURNS trigger AS $$
            DECLARE estado_version text;
            BEGIN
                IF TG_TABLE_NAME = 'versiones_plantilla' THEN
                    estado_version := OLD.estado;
                ELSE
                    SELECT estado INTO estado_version FROM versiones_plantilla
                    WHERE id = COALESCE(OLD.version_plantilla_id, NEW.version_plantilla_id);
                END IF;

                IF estado_version = 'published' THEN
                    RAISE EXCEPTION 'La versión de plantilla publicada es inmutable' USING ERRCODE = '23514';
                END IF;

                RETURN COALESCE(NEW, OLD);
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_version_plantilla_publicada
            BEFORE UPDATE OR DELETE ON versiones_plantilla
            FOR EACH ROW EXECUTE FUNCTION proteger_configuracion_publicada();

            CREATE TRIGGER proteger_seccion_plantilla_publicada
            BEFORE INSERT OR UPDATE OR DELETE ON secciones_plantilla
            FOR EACH ROW EXECUTE FUNCTION proteger_configuracion_publicada();

            CREATE TRIGGER proteger_bloque_plantilla_publicada
            BEFORE INSERT OR UPDATE OR DELETE ON bloques_plantilla
            FOR EACH ROW EXECUTE FUNCTION proteger_configuracion_publicada();

            CREATE TRIGGER proteger_campo_plantilla_publicada
            BEFORE INSERT OR UPDATE OR DELETE ON definiciones_campo
            FOR EACH ROW EXECUTE FUNCTION proteger_configuracion_publicada();

            CREATE OR REPLACE FUNCTION proteger_fragmento_fuente_activa() RETURNS trigger AS $$
            DECLARE estado_version text;
            BEGIN
                SELECT estado INTO estado_version FROM versiones_fuente
                WHERE id = COALESCE(OLD.version_fuente_id, NEW.version_fuente_id);

                IF estado_version IN ('active', 'superseded') THEN
                    RAISE EXCEPTION 'La versión de fuente activada es inmutable' USING ERRCODE = '23514';
                END IF;

                RETURN COALESCE(NEW, OLD);
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_fragmento_fuente
            BEFORE INSERT OR UPDATE OR DELETE ON fragmentos_fuente
            FOR EACH ROW EXECUTE FUNCTION proteger_fragmento_fuente_activa();
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_fragmento_fuente_activa() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_configuracion_publicada() CASCADE');
        Schema::dropIfExists('conflictos_fuente');
        Schema::dropIfExists('fragmentos_fuente');
        Schema::dropIfExists('versiones_fuente');
        Schema::dropIfExists('fuentes_academicas');
        Schema::dropIfExists('definiciones_campo');
        Schema::dropIfExists('bloques_plantilla');
        Schema::dropIfExists('secciones_plantilla');
        Schema::dropIfExists('versiones_plantilla');
        Schema::dropIfExists('plantillas_silabo');
    }
};
