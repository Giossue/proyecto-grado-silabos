<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('revisiones_silabo', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->restrictOnDelete();
            $table->uuid('revision_anterior_id')->nullable();
            $table->unsignedSmallInteger('numero_revision');
            $table->uuid('clave_idempotencia');
            $table->unsignedInteger('lock_version_origen');
            $table->jsonb('snapshot');
            $table->char('huella_sha256', 64);
            $table->foreignUuid('enviado_por')->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('enviado_en');
            $table->timestampsTz();

            $table->unique(['silabo_id', 'numero_revision']);
            $table->unique(['silabo_id', 'clave_idempotencia']);
            $table->index(['silabo_id', 'enviado_en']);
        });

        Schema::table('revisiones_silabo', function (Blueprint $table) {
            $table->foreign('revision_anterior_id')->references('id')->on('revisiones_silabo')->restrictOnDelete();
        });

        Schema::create('observaciones_revision', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('revision_silabo_id')->constrained('revisiones_silabo')->restrictOnDelete();
            $table->string('clave_seccion', 100)->nullable();
            $table->string('clave_campo', 120)->nullable();
            $table->text('contenido');
            $table->string('estado', 24)->default('open');
            $table->foreignUuid('creado_por')->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('creado_en');
            $table->timestampsTz();

            $table->index(['revision_silabo_id', 'estado']);
        });

        Schema::create('solicitudes_correccion', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->restrictOnDelete();
            $table->foreignUuid('revision_silabo_id')->unique()->constrained('revisiones_silabo')->restrictOnDelete();
            $table->text('justificacion');
            $table->foreignUuid('solicitado_por')->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('solicitado_en');
            $table->timestampsTz();
        });

        Schema::create('solicitud_correccion_observaciones', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('solicitud_correccion_id')->constrained('solicitudes_correccion')->restrictOnDelete();
            $table->foreignUuid('observacion_revision_id')->constrained('observaciones_revision')->restrictOnDelete();
            $table->timestampTz('created_at');

            $table->unique(['solicitud_correccion_id', 'observacion_revision_id'], 'solicitud_observacion_unica');
        });

        Schema::create('respuestas_observacion', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->restrictOnDelete();
            $table->foreignUuid('observacion_revision_id')->unique()->constrained('observaciones_revision')->restrictOnDelete();
            $table->foreignUuid('revision_respuesta_id')->nullable()->constrained('revisiones_silabo')->restrictOnDelete();
            $table->text('contenido');
            $table->foreignUuid('respondido_por')->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('respondido_en');
            $table->timestampsTz();

            $table->index(['silabo_id', 'revision_respuesta_id']);
        });

        Schema::create('aprobaciones', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->restrictOnDelete();
            $table->foreignUuid('revision_silabo_id')->unique()->constrained('revisiones_silabo')->restrictOnDelete();
            $table->uuid('clave_idempotencia');
            $table->char('huella_sha256', 64);
            $table->foreignUuid('aprobado_por')->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('aprobado_en');
            $table->timestampsTz();

            $table->unique(['silabo_id', 'clave_idempotencia']);
            $table->index(['silabo_id', 'aprobado_en']);
        });

        Schema::create('reaperturas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->restrictOnDelete();
            $table->foreignUuid('aprobacion_id')->unique()->constrained('aprobaciones')->restrictOnDelete();
            $table->foreignUuid('revision_aprobada_id')->constrained('revisiones_silabo')->restrictOnDelete();
            $table->uuid('clave_idempotencia');
            $table->text('causa');
            $table->foreignUuid('reabierto_por')->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('reabierto_en');
            $table->timestampsTz();

            $table->unique(['silabo_id', 'clave_idempotencia']);
        });

        Schema::table('revisiones_silabo', function (Blueprint $table) {
            $table->foreignUuid('reapertura_id')->nullable()->after('revision_anterior_id')
                ->constrained('reaperturas')->restrictOnDelete();
        });

        Schema::create('transiciones_silabo', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->restrictOnDelete();
            $table->foreignUuid('revision_silabo_id')->nullable()->constrained('revisiones_silabo')->restrictOnDelete();
            $table->string('estado_origen', 32);
            $table->string('estado_destino', 32);
            $table->string('accion', 60);
            $table->foreignUuid('actor_usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('asignacion_rol_id')->nullable()->constrained('asignaciones_rol')->restrictOnDelete();
            $table->jsonb('metadatos')->nullable();
            $table->timestampTz('ocurrido_en');
            $table->timestampTz('created_at');

            $table->index(['silabo_id', 'ocurrido_en']);
        });

        DB::statement("ALTER TABLE observaciones_revision ADD CONSTRAINT observaciones_revision_estado_check CHECK (estado IN ('open', 'responded', 'verified'))");
        DB::statement("ALTER TABLE transiciones_silabo ADD CONSTRAINT transiciones_silabo_accion_check CHECK (accion IN ('submit', 'request_correction', 'resubmit', 'approve', 'reopen'))");
        DB::statement(<<<'SQL'
            ALTER TABLE transiciones_silabo
            ADD CONSTRAINT transiciones_silabo_flujo_check CHECK (
                (accion = 'submit' AND estado_origen = 'draft' AND estado_destino = 'in_review')
                OR (accion = 'request_correction' AND estado_origen = 'in_review' AND estado_destino = 'correction_requested')
                OR (accion = 'resubmit' AND estado_origen = 'correction_requested' AND estado_destino = 'in_review')
                OR (accion = 'approve' AND estado_origen = 'in_review' AND estado_destino = 'approved')
                OR (accion = 'reopen' AND estado_origen = 'approved' AND estado_destino = 'correction_requested')
            )
            SQL);

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION validar_relaciones_revision() RETURNS trigger AS $$
            DECLARE
                silabo_relacionado uuid;
                numero_anterior integer;
            BEGIN
                IF NEW.revision_anterior_id IS NOT NULL THEN
                    SELECT silabo_id, numero_revision
                    INTO silabo_relacionado, numero_anterior
                    FROM revisiones_silabo
                    WHERE id = NEW.revision_anterior_id;
                    IF silabo_relacionado IS DISTINCT FROM NEW.silabo_id
                       OR NEW.numero_revision <> numero_anterior + 1 THEN
                        RAISE EXCEPTION 'La revisión anterior no pertenece a la secuencia del sílabo' USING ERRCODE = '23514';
                    END IF;
                ELSIF NEW.numero_revision <> 1 THEN
                    RAISE EXCEPTION 'La primera revisión debe tener número 1' USING ERRCODE = '23514';
                END IF;
                IF NEW.reapertura_id IS NOT NULL THEN
                    SELECT silabo_id INTO silabo_relacionado FROM reaperturas WHERE id = NEW.reapertura_id;
                    IF silabo_relacionado IS DISTINCT FROM NEW.silabo_id THEN
                        RAISE EXCEPTION 'La reapertura no pertenece al sílabo' USING ERRCODE = '23514';
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_revision_silabo
            BEFORE INSERT OR UPDATE ON revisiones_silabo
            FOR EACH ROW EXECUTE FUNCTION validar_relaciones_revision();

            CREATE OR REPLACE FUNCTION validar_relaciones_flujo() RETURNS trigger AS $$
            DECLARE
                silabo_relacionado uuid;
                revision_relacionada uuid;
            BEGIN
                IF TG_TABLE_NAME = 'solicitudes_correccion' THEN
                    SELECT silabo_id INTO silabo_relacionado FROM revisiones_silabo WHERE id = NEW.revision_silabo_id;
                    IF silabo_relacionado IS DISTINCT FROM NEW.silabo_id THEN
                        RAISE EXCEPTION 'La solicitud y la revisión pertenecen a sílabos distintos' USING ERRCODE = '23514';
                    END IF;
                ELSIF TG_TABLE_NAME = 'solicitud_correccion_observaciones' THEN
                    SELECT revision_silabo_id INTO revision_relacionada FROM solicitudes_correccion WHERE id = NEW.solicitud_correccion_id;
                    SELECT revision_silabo_id INTO silabo_relacionado FROM observaciones_revision WHERE id = NEW.observacion_revision_id;
                    IF revision_relacionada IS DISTINCT FROM silabo_relacionado THEN
                        RAISE EXCEPTION 'La observación no pertenece a la revisión solicitada' USING ERRCODE = '23514';
                    END IF;
                ELSIF TG_TABLE_NAME = 'respuestas_observacion' THEN
                    SELECT r.silabo_id INTO silabo_relacionado
                    FROM observaciones_revision o
                    JOIN revisiones_silabo r ON r.id = o.revision_silabo_id
                    WHERE o.id = NEW.observacion_revision_id;
                    IF silabo_relacionado IS DISTINCT FROM NEW.silabo_id THEN
                        RAISE EXCEPTION 'La respuesta no pertenece al sílabo observado' USING ERRCODE = '23514';
                    END IF;
                    IF NEW.revision_respuesta_id IS NOT NULL THEN
                        SELECT silabo_id INTO silabo_relacionado FROM revisiones_silabo WHERE id = NEW.revision_respuesta_id;
                        IF silabo_relacionado IS DISTINCT FROM NEW.silabo_id THEN
                            RAISE EXCEPTION 'La revisión de respuesta pertenece a otro sílabo' USING ERRCODE = '23514';
                        END IF;
                    END IF;
                ELSIF TG_TABLE_NAME = 'aprobaciones' THEN
                    SELECT silabo_id INTO silabo_relacionado FROM revisiones_silabo WHERE id = NEW.revision_silabo_id;
                    IF silabo_relacionado IS DISTINCT FROM NEW.silabo_id THEN
                        RAISE EXCEPTION 'La aprobación y la revisión pertenecen a sílabos distintos' USING ERRCODE = '23514';
                    END IF;
                ELSIF TG_TABLE_NAME = 'reaperturas' THEN
                    SELECT silabo_id, revision_silabo_id
                    INTO silabo_relacionado, revision_relacionada
                    FROM aprobaciones WHERE id = NEW.aprobacion_id;
                    IF silabo_relacionado IS DISTINCT FROM NEW.silabo_id
                       OR revision_relacionada IS DISTINCT FROM NEW.revision_aprobada_id THEN
                        RAISE EXCEPTION 'La reapertura no coincide con la aprobación vigente' USING ERRCODE = '23514';
                    END IF;
                ELSIF TG_TABLE_NAME = 'transiciones_silabo' AND NEW.revision_silabo_id IS NOT NULL THEN
                    SELECT silabo_id INTO silabo_relacionado FROM revisiones_silabo WHERE id = NEW.revision_silabo_id;
                    IF silabo_relacionado IS DISTINCT FROM NEW.silabo_id THEN
                        RAISE EXCEPTION 'La transición y la revisión pertenecen a sílabos distintos' USING ERRCODE = '23514';
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_solicitud_correccion
            BEFORE INSERT OR UPDATE ON solicitudes_correccion
            FOR EACH ROW EXECUTE FUNCTION validar_relaciones_flujo();
            CREATE TRIGGER validar_solicitud_observacion
            BEFORE INSERT OR UPDATE ON solicitud_correccion_observaciones
            FOR EACH ROW EXECUTE FUNCTION validar_relaciones_flujo();
            CREATE TRIGGER validar_respuesta_observacion
            BEFORE INSERT OR UPDATE ON respuestas_observacion
            FOR EACH ROW EXECUTE FUNCTION validar_relaciones_flujo();
            CREATE TRIGGER validar_aprobacion
            BEFORE INSERT OR UPDATE ON aprobaciones
            FOR EACH ROW EXECUTE FUNCTION validar_relaciones_flujo();
            CREATE TRIGGER validar_reapertura
            BEFORE INSERT OR UPDATE ON reaperturas
            FOR EACH ROW EXECUTE FUNCTION validar_relaciones_flujo();
            CREATE TRIGGER validar_transicion_revision
            BEFORE INSERT OR UPDATE ON transiciones_silabo
            FOR EACH ROW EXECUTE FUNCTION validar_relaciones_flujo();

            CREATE OR REPLACE FUNCTION proteger_registro_append_only() RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'El registro histórico es inmutable' USING ERRCODE = '23514';
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_revision_silabo
            BEFORE UPDATE OR DELETE ON revisiones_silabo
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();

            CREATE TRIGGER proteger_solicitud_correccion
            BEFORE UPDATE OR DELETE ON solicitudes_correccion
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();

            CREATE TRIGGER proteger_aprobacion
            BEFORE UPDATE OR DELETE ON aprobaciones
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();

            CREATE TRIGGER proteger_reapertura
            BEFORE UPDATE OR DELETE ON reaperturas
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();

            CREATE TRIGGER proteger_transicion_silabo
            BEFORE UPDATE OR DELETE ON transiciones_silabo
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();

            CREATE OR REPLACE FUNCTION proteger_contenido_observacion() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.revision_silabo_id IS DISTINCT FROM OLD.revision_silabo_id
                   OR NEW.clave_seccion IS DISTINCT FROM OLD.clave_seccion
                   OR NEW.clave_campo IS DISTINCT FROM OLD.clave_campo
                   OR NEW.contenido IS DISTINCT FROM OLD.contenido
                   OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
                   OR NEW.creado_en IS DISTINCT FROM OLD.creado_en THEN
                    RAISE EXCEPTION 'El contenido de la observación es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_observacion_revision
            BEFORE UPDATE OR DELETE ON observaciones_revision
            FOR EACH ROW EXECUTE FUNCTION proteger_contenido_observacion();

            CREATE OR REPLACE FUNCTION proteger_respuesta_enviada() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE' OR OLD.revision_respuesta_id IS NOT NULL THEN
                    RAISE EXCEPTION 'La respuesta enviada es inmutable' USING ERRCODE = '23514';
                END IF;
                IF NEW.silabo_id IS DISTINCT FROM OLD.silabo_id
                   OR NEW.observacion_revision_id IS DISTINCT FROM OLD.observacion_revision_id THEN
                    RAISE EXCEPTION 'No se puede cambiar la identidad de la respuesta' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_respuesta_observacion
            BEFORE UPDATE OR DELETE ON respuestas_observacion
            FOR EACH ROW EXECUTE FUNCTION proteger_respuesta_enviada();
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP FUNCTION IF EXISTS validar_relaciones_flujo() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_relaciones_revision() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_respuesta_enviada() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_contenido_observacion() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_registro_append_only() CASCADE');
        Schema::dropIfExists('transiciones_silabo');
        Schema::table('revisiones_silabo', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reapertura_id');
        });
        Schema::dropIfExists('reaperturas');
        Schema::dropIfExists('aprobaciones');
        Schema::dropIfExists('respuestas_observacion');
        Schema::dropIfExists('solicitud_correccion_observaciones');
        Schema::dropIfExists('solicitudes_correccion');
        Schema::dropIfExists('observaciones_revision');
        Schema::dropIfExists('revisiones_silabo');
    }
};
