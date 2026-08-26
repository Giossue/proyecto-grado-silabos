<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ejecuciones_ia', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->restrictOnDelete();
            $table->foreignUuid('definicion_campo_id')->constrained('definiciones_campo')->restrictOnDelete();
            $table->foreignUuid('version_plantilla_id')->constrained('versiones_plantilla')->restrictOnDelete();
            $table->foreignUuid('ejecucion_trabajo_id')->nullable()->unique()->constrained('ejecuciones_trabajo')->restrictOnDelete();
            $table->uuid('clave_idempotencia');
            $table->char('clave_funcional', 64);
            $table->string('estado', 24)->default('pending');
            $table->string('version_contrato', 40);
            $table->string('version_instruccion', 40);
            $table->string('version_gateway_solicitada', 80);
            $table->string('version_gateway_ejecutada', 80)->nullable();
            $table->string('locale', 20)->default('es-EC');
            $table->text('contenido_entrada');
            $table->char('huella_contenido', 64);
            $table->char('huella_conjunto_fuentes', 64);
            $table->jsonb('metadatos_entrada');
            $table->unsignedInteger('lock_version_origen');
            $table->string('motivo_no_concluyente', 80)->nullable();
            $table->string('codigo_error', 80)->nullable();
            $table->text('mensaje_error')->nullable();
            $table->foreignUuid('solicitado_por')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('asignacion_rol_id')->nullable()->constrained('asignaciones_rol')->restrictOnDelete();
            $table->timestampTz('solicitado_en');
            $table->timestampTz('iniciado_en')->nullable();
            $table->timestampTz('completado_en')->nullable();
            $table->timestampsTz();

            $table->unique(
                ['silabo_id', 'definicion_campo_id', 'clave_idempotencia'],
                'ejecucion_ia_idempotencia_unica',
            );
            $table->index(
                ['silabo_id', 'definicion_campo_id', 'solicitado_en'],
                'ejecucion_ia_historial_idx',
            );
            $table->index(['estado', 'solicitado_en'], 'ejecucion_ia_estado_idx');
        });

        Schema::create('evidencias_ia', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('ejecucion_ia_id')->constrained('ejecuciones_ia')->restrictOnDelete();
            $table->foreignUuid('fuente_academica_id')->constrained('fuentes_academicas')->restrictOnDelete();
            $table->foreignUuid('version_fuente_id')->constrained('versiones_fuente')->restrictOnDelete();
            $table->foreignUuid('fragmento_fuente_id')->constrained('fragmentos_fuente')->restrictOnDelete();
            $table->string('nombre_fuente', 180);
            $table->string('autoridad_fuente', 180);
            $table->unsignedSmallInteger('numero_version');
            $table->string('clave_fragmento', 120);
            $table->string('titulo_fragmento', 180);
            $table->string('clave_dato', 160)->nullable();
            $table->text('extracto');
            $table->char('huella_fragmento', 64);
            $table->timestampTz('created_at');

            $table->unique(
                ['ejecucion_ia_id', 'fragmento_fuente_id'],
                'evidencia_ia_fragmento_unico',
            );
        });

        Schema::create('recomendaciones_ia', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('ejecucion_ia_id')->constrained('ejecuciones_ia')->restrictOnDelete();
            $table->foreignUuid('definicion_campo_id')->constrained('definiciones_campo')->restrictOnDelete();
            $table->unsignedSmallInteger('ordinal');
            $table->string('tipo', 40);
            $table->string('titulo', 180);
            $table->text('explicacion');
            $table->text('texto_sugerido');
            $table->timestampTz('created_at');

            $table->unique(['ejecucion_ia_id', 'ordinal'], 'recomendacion_ia_ordinal_unico');
        });

        Schema::create('recomendacion_evidencias_ia', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('recomendacion_ia_id')->constrained('recomendaciones_ia')->restrictOnDelete();
            $table->foreignUuid('evidencia_ia_id')->constrained('evidencias_ia')->restrictOnDelete();
            $table->timestampTz('created_at');

            $table->unique(
                ['recomendacion_ia_id', 'evidencia_ia_id'],
                'recomendacion_evidencia_ia_unica',
            );
        });

        Schema::create('retroalimentacion_ia', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('recomendacion_ia_id')->constrained('recomendaciones_ia')->restrictOnDelete();
            $table->foreignUuid('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('asignacion_rol_id')->nullable()->constrained('asignaciones_rol')->restrictOnDelete();
            $table->string('decision', 24);
            $table->text('contenido_antes')->nullable();
            $table->text('contenido_despues')->nullable();
            $table->unsignedInteger('lock_version_origen')->nullable();
            $table->unsignedInteger('lock_version_resultado')->nullable();
            $table->timestampTz('decidido_en');
            $table->timestampTz('created_at');

            $table->unique(
                ['recomendacion_ia_id', 'usuario_id', 'decision'],
                'retroalimentacion_ia_usuario_decision_unica',
            );
        });

        DB::statement("ALTER TABLE ejecuciones_ia ADD CONSTRAINT ejecuciones_ia_estado_check CHECK (estado IN ('pending', 'running', 'completed', 'inconclusive', 'failed'))");
        DB::statement('ALTER TABLE ejecuciones_ia ADD CONSTRAINT ejecuciones_ia_contenido_check CHECK (char_length(contenido_entrada) <= 50000)');
        DB::statement(<<<'SQL'
            ALTER TABLE ejecuciones_ia ADD CONSTRAINT ejecuciones_ia_terminal_check CHECK (
                (estado = 'completed'
                    AND version_gateway_ejecutada IS NOT NULL
                    AND completado_en IS NOT NULL
                    AND motivo_no_concluyente IS NULL
                    AND codigo_error IS NULL
                    AND mensaje_error IS NULL)
                OR (estado = 'inconclusive'
                    AND completado_en IS NOT NULL
                    AND motivo_no_concluyente IS NOT NULL
                    AND codigo_error IS NULL
                    AND mensaje_error IS NULL)
                OR (estado = 'failed'
                    AND completado_en IS NOT NULL
                    AND codigo_error IS NOT NULL
                    AND mensaje_error IS NOT NULL
                    AND motivo_no_concluyente IS NULL)
                OR estado IN ('pending', 'running')
            )
            SQL);
        DB::statement("ALTER TABLE recomendaciones_ia ADD CONSTRAINT recomendaciones_ia_tipo_check CHECK (tipo IN ('editorial', 'clarity', 'consistency'))");
        DB::statement('ALTER TABLE recomendaciones_ia ADD CONSTRAINT recomendaciones_ia_longitud_check CHECK (char_length(texto_sugerido) BETWEEN 1 AND 50000 AND char_length(explicacion) BETWEEN 1 AND 4000)');
        DB::statement("ALTER TABLE retroalimentacion_ia ADD CONSTRAINT retroalimentacion_ia_decision_check CHECK (decision IN ('accepted', 'ignored', 'not_useful', 'applied'))");
        DB::statement(<<<'SQL'
            ALTER TABLE retroalimentacion_ia ADD CONSTRAINT retroalimentacion_ia_aplicacion_check CHECK (
                (decision = 'applied'
                    AND contenido_antes IS NOT NULL
                    AND contenido_despues IS NOT NULL
                    AND lock_version_origen IS NOT NULL
                    AND lock_version_resultado = lock_version_origen + 1)
                OR (decision <> 'applied'
                    AND contenido_antes IS NULL
                    AND contenido_despues IS NULL
                    AND lock_version_origen IS NULL
                    AND lock_version_resultado IS NULL)
            )
            SQL);
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX ejecucion_ia_funcional_activa_unica
            ON ejecuciones_ia (silabo_id, definicion_campo_id, clave_funcional)
            WHERE estado IN ('pending', 'running', 'completed', 'inconclusive')
            SQL);
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX retroalimentacion_ia_aplicada_unica
            ON retroalimentacion_ia (recomendacion_ia_id)
            WHERE decision = 'applied'
            SQL);

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION validar_ejecucion_ia() RETURNS trigger AS $$
            DECLARE
                plantilla_silabo uuid;
                plantilla_campo uuid;
            BEGIN
                SELECT version_plantilla_id INTO plantilla_silabo
                FROM silabos WHERE id = NEW.silabo_id;
                SELECT version_plantilla_id INTO plantilla_campo
                FROM definiciones_campo WHERE id = NEW.definicion_campo_id;

                IF plantilla_silabo IS DISTINCT FROM NEW.version_plantilla_id
                   OR plantilla_campo IS DISTINCT FROM NEW.version_plantilla_id THEN
                    RAISE EXCEPTION 'La ejecución de IA no coincide con la plantilla y campo del sílabo' USING ERRCODE = '23514';
                END IF;

                IF TG_OP = 'UPDATE' THEN
                    IF OLD.estado IN ('completed', 'inconclusive', 'failed') THEN
                        RAISE EXCEPTION 'Una ejecución de IA terminal es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF NEW.id IS DISTINCT FROM OLD.id
                       OR NEW.silabo_id IS DISTINCT FROM OLD.silabo_id
                       OR NEW.definicion_campo_id IS DISTINCT FROM OLD.definicion_campo_id
                       OR NEW.version_plantilla_id IS DISTINCT FROM OLD.version_plantilla_id
                       OR NEW.clave_idempotencia IS DISTINCT FROM OLD.clave_idempotencia
                       OR NEW.clave_funcional IS DISTINCT FROM OLD.clave_funcional
                       OR NEW.version_contrato IS DISTINCT FROM OLD.version_contrato
                       OR NEW.version_instruccion IS DISTINCT FROM OLD.version_instruccion
                       OR NEW.version_gateway_solicitada IS DISTINCT FROM OLD.version_gateway_solicitada
                       OR NEW.locale IS DISTINCT FROM OLD.locale
                       OR NEW.contenido_entrada IS DISTINCT FROM OLD.contenido_entrada
                       OR NEW.huella_contenido IS DISTINCT FROM OLD.huella_contenido
                       OR NEW.huella_conjunto_fuentes IS DISTINCT FROM OLD.huella_conjunto_fuentes
                       OR NEW.metadatos_entrada IS DISTINCT FROM OLD.metadatos_entrada
                       OR NEW.lock_version_origen IS DISTINCT FROM OLD.lock_version_origen
                       OR NEW.solicitado_por IS DISTINCT FROM OLD.solicitado_por
                       OR NEW.asignacion_rol_id IS DISTINCT FROM OLD.asignacion_rol_id
                       OR NEW.solicitado_en IS DISTINCT FROM OLD.solicitado_en THEN
                        RAISE EXCEPTION 'La entrada fijada de una ejecución de IA es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF OLD.ejecucion_trabajo_id IS NOT NULL
                       AND NEW.ejecucion_trabajo_id IS DISTINCT FROM OLD.ejecucion_trabajo_id THEN
                        RAISE EXCEPTION 'El trabajo asociado a la ejecución de IA es inmutable' USING ERRCODE = '23514';
                    END IF;
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_y_proteger_ejecucion_ia
            BEFORE INSERT OR UPDATE ON ejecuciones_ia
            FOR EACH ROW EXECUTE FUNCTION validar_ejecucion_ia();

            CREATE TRIGGER proteger_eliminacion_ejecucion_ia
            BEFORE DELETE ON ejecuciones_ia
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();

            CREATE OR REPLACE FUNCTION validar_evidencia_ia() RETURNS trigger AS $$
            DECLARE
                fuente_version uuid;
                version_fragmento uuid;
                carrera_fuente uuid;
                carrera_silabo uuid;
                fuente_activa boolean;
                estado_version text;
                desde date;
                hasta date;
                campania_silabo uuid;
                estado_ejecucion text;
            BEGIN
                SELECT fuente_academica_id, estado, vigente_desde, vigente_hasta
                INTO fuente_version, estado_version, desde, hasta
                FROM versiones_fuente WHERE id = NEW.version_fuente_id;
                SELECT version_fuente_id INTO version_fragmento
                FROM fragmentos_fuente WHERE id = NEW.fragmento_fuente_id;
                SELECT activo, carrera_id INTO fuente_activa, carrera_fuente
                FROM fuentes_academicas WHERE id = NEW.fuente_academica_id;
                SELECT s.campania_id, c.carrera_id, e.estado
                INTO campania_silabo, carrera_silabo, estado_ejecucion
                FROM ejecuciones_ia e
                JOIN silabos s ON s.id = e.silabo_id
                JOIN campanias c ON c.id = s.campania_id
                WHERE e.id = NEW.ejecucion_ia_id;

                IF fuente_version IS DISTINCT FROM NEW.fuente_academica_id
                   OR version_fragmento IS DISTINCT FROM NEW.version_fuente_id
                   OR carrera_fuente IS DISTINCT FROM carrera_silabo
                   OR fuente_activa IS DISTINCT FROM TRUE
                   OR estado_version IS DISTINCT FROM 'active'
                   OR estado_ejecucion IS DISTINCT FROM 'pending'
                   OR (desde IS NOT NULL AND desde > CURRENT_DATE)
                   OR (hasta IS NOT NULL AND hasta < CURRENT_DATE)
                   OR NOT EXISTS (
                       SELECT 1 FROM fuentes_campania
                       WHERE campania_id = campania_silabo
                         AND version_fuente_id = NEW.version_fuente_id
                   ) THEN
                    RAISE EXCEPTION 'La evidencia de IA no es una fuente activa y vigente de la campaña' USING ERRCODE = '23514';
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_evidencia_ia
            BEFORE INSERT ON evidencias_ia
            FOR EACH ROW EXECUTE FUNCTION validar_evidencia_ia();

            CREATE OR REPLACE FUNCTION validar_recomendacion_ia() RETURNS trigger AS $$
            DECLARE campo_ejecucion uuid;
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT definicion_campo_id, estado INTO campo_ejecucion, estado_ejecucion
                FROM ejecuciones_ia WHERE id = NEW.ejecucion_ia_id;
                IF campo_ejecucion IS DISTINCT FROM NEW.definicion_campo_id
                   OR estado_ejecucion IS DISTINCT FROM 'running' THEN
                    RAISE EXCEPTION 'La recomendación no corresponde al campo analizado' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_recomendacion_ia
            BEFORE INSERT ON recomendaciones_ia
            FOR EACH ROW EXECUTE FUNCTION validar_recomendacion_ia();

            CREATE OR REPLACE FUNCTION validar_recomendacion_evidencia_ia() RETURNS trigger AS $$
            DECLARE ejecucion_recomendacion uuid;
            DECLARE ejecucion_evidencia uuid;
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT r.ejecucion_ia_id, e.estado
                INTO ejecucion_recomendacion, estado_ejecucion
                FROM recomendaciones_ia r
                JOIN ejecuciones_ia e ON e.id = r.ejecucion_ia_id
                WHERE r.id = NEW.recomendacion_ia_id;
                SELECT ejecucion_ia_id INTO ejecucion_evidencia
                FROM evidencias_ia WHERE id = NEW.evidencia_ia_id;
                IF ejecucion_recomendacion IS DISTINCT FROM ejecucion_evidencia
                   OR estado_ejecucion IS DISTINCT FROM 'running' THEN
                    RAISE EXCEPTION 'La recomendación y evidencia pertenecen a ejecuciones distintas' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_recomendacion_evidencia_ia
            BEFORE INSERT ON recomendacion_evidencias_ia
            FOR EACH ROW EXECUTE FUNCTION validar_recomendacion_evidencia_ia();

            CREATE OR REPLACE FUNCTION validar_retroalimentacion_ia() RETURNS trigger AS $$
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT e.estado INTO estado_ejecucion
                FROM recomendaciones_ia r
                JOIN ejecuciones_ia e ON e.id = r.ejecucion_ia_id
                WHERE r.id = NEW.recomendacion_ia_id;
                IF estado_ejecucion IS DISTINCT FROM 'completed' THEN
                    RAISE EXCEPTION 'Solo una recomendación completada admite decisión humana' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_retroalimentacion_ia
            BEFORE INSERT ON retroalimentacion_ia
            FOR EACH ROW EXECUTE FUNCTION validar_retroalimentacion_ia();

            CREATE TRIGGER proteger_evidencia_ia
            BEFORE UPDATE OR DELETE ON evidencias_ia
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();
            CREATE TRIGGER proteger_recomendacion_ia
            BEFORE UPDATE OR DELETE ON recomendaciones_ia
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();
            CREATE TRIGGER proteger_recomendacion_evidencia_ia
            BEFORE UPDATE OR DELETE ON recomendacion_evidencias_ia
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();
            CREATE TRIGGER proteger_retroalimentacion_ia
            BEFORE UPDATE OR DELETE ON retroalimentacion_ia
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP FUNCTION IF EXISTS validar_recomendacion_evidencia_ia() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_recomendacion_ia() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_retroalimentacion_ia() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_evidencia_ia() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_ejecucion_ia() CASCADE');
        Schema::dropIfExists('retroalimentacion_ia');
        Schema::dropIfExists('recomendacion_evidencias_ia');
        Schema::dropIfExists('recomendaciones_ia');
        Schema::dropIfExists('evidencias_ia');
        Schema::dropIfExists('ejecuciones_ia');
    }
};
