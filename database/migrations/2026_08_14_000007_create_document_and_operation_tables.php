<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ejecuciones_trabajo', function (Blueprint $table) {
            $table->string('queue_name', 80)->default('default')->after('type');
            $table->string('resource_type', 100)->nullable()->after('correlation_id');
            $table->uuid('resource_id')->nullable()->after('resource_type');
            $table->unsignedSmallInteger('max_attempts')->default(3)->after('attempts');

            $table->index(['resource_type', 'resource_id']);
            $table->index(['queue_name', 'status', 'created_at']);
        });

        Schema::create('objetos_almacenados', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('disco', 80);
            $table->string('ruta_interna', 500);
            $table->string('nombre_logico', 255);
            $table->string('mime', 120);
            $table->unsignedBigInteger('tamano_bytes');
            $table->char('huella_sha256', 64);
            $table->string('clasificacion', 80);
            $table->string('estado', 24)->default('active');
            $table->foreignUuid('propietario_usuario_id')->nullable()->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('carrera_id')->nullable()->constrained('carreras')->restrictOnDelete();
            $table->timestampTz('creado_en');
            $table->timestampsTz();

            $table->unique(['disco', 'ruta_interna']);
            $table->index(['clasificacion', 'estado', 'creado_en']);
            $table->index('huella_sha256');
        });

        Schema::create('artefactos_exportacion', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('silabo_id')->constrained('silabos')->restrictOnDelete();
            $table->foreignUuid('revision_silabo_id')->constrained('revisiones_silabo')->restrictOnDelete();
            $table->foreignUuid('version_plantilla_id')->constrained('versiones_plantilla')->restrictOnDelete();
            $table->foreignUuid('ejecucion_trabajo_id')->nullable()->unique()->constrained('ejecuciones_trabajo')->restrictOnDelete();
            $table->foreignUuid('objeto_docx_id')->nullable()->unique()->constrained('objetos_almacenados')->restrictOnDelete();
            $table->foreignUuid('objeto_pdf_id')->nullable()->unique()->constrained('objetos_almacenados')->restrictOnDelete();
            $table->string('version_renderer', 80);
            $table->string('locale', 20)->default('es-EC');
            $table->uuid('clave_idempotencia');
            $table->string('estado', 24)->default('pending');
            $table->foreignUuid('solicitado_por')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('asignacion_rol_id')->nullable()->constrained('asignaciones_rol')->restrictOnDelete();
            $table->timestampTz('solicitado_en');
            $table->timestampTz('completado_en')->nullable();
            $table->timestampsTz();

            $table->unique(['revision_silabo_id', 'clave_idempotencia'], 'exportacion_revision_idempotencia_unica');
            $table->index(['silabo_id', 'estado', 'solicitado_en']);
        });

        Schema::create('notificaciones_internas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->string('clave_deduplicacion', 180);
            $table->string('tipo', 100);
            $table->string('titulo', 180);
            $table->text('mensaje');
            $table->string('tipo_recurso', 100)->nullable();
            $table->uuid('recurso_id')->nullable();
            $table->timestampTz('leido_en')->nullable();
            $table->timestampTz('creado_en');
            $table->timestampTz('created_at');

            $table->unique(['usuario_id', 'clave_deduplicacion']);
            $table->index(['usuario_id', 'leido_en', 'creado_en']);
        });

        Schema::create('eventos_outbox', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('tipo_agregado', 100);
            $table->uuid('agregado_id');
            $table->string('tipo_evento', 120);
            $table->string('clave_deduplicacion', 180)->unique();
            $table->jsonb('payload');
            $table->string('estado', 24)->default('pending');
            $table->unsignedSmallInteger('intentos')->default(0);
            $table->timestampTz('disponible_en');
            $table->timestampTz('procesado_en')->nullable();
            $table->string('codigo_error', 80)->nullable();
            $table->text('mensaje_error')->nullable();
            $table->timestampTz('ocurrido_en');
            $table->timestampsTz();

            $table->index(['estado', 'disponible_en']);
            $table->index(['tipo_agregado', 'agregado_id', 'ocurrido_en']);
        });

        DB::statement("ALTER TABLE objetos_almacenados ADD CONSTRAINT objetos_almacenados_estado_check CHECK (estado IN ('active', 'quarantined'))");
        DB::statement("ALTER TABLE artefactos_exportacion ADD CONSTRAINT artefactos_exportacion_estado_check CHECK (estado IN ('pending', 'running', 'completed', 'failed'))");
        DB::statement("ALTER TABLE eventos_outbox ADD CONSTRAINT eventos_outbox_estado_check CHECK (estado IN ('pending', 'processing', 'processed', 'failed'))");
        DB::statement("ALTER TABLE artefactos_exportacion ADD CONSTRAINT artefactos_exportacion_completitud_check CHECK ((estado = 'completed' AND objeto_docx_id IS NOT NULL AND objeto_pdf_id IS NOT NULL AND completado_en IS NOT NULL) OR estado <> 'completed')");

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION validar_artefacto_exportacion() RETURNS trigger AS $$
            DECLARE
                silabo_revision uuid;
                plantilla_silabo uuid;
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Un artefacto de exportación no puede eliminarse' USING ERRCODE = '23514';
                END IF;
                SELECT r.silabo_id, s.version_plantilla_id
                INTO silabo_revision, plantilla_silabo
                FROM revisiones_silabo r
                JOIN silabos s ON s.id = r.silabo_id
                WHERE r.id = NEW.revision_silabo_id;
                IF silabo_revision IS DISTINCT FROM NEW.silabo_id
                   OR plantilla_silabo IS DISTINCT FROM NEW.version_plantilla_id THEN
                    RAISE EXCEPTION 'El artefacto no coincide con la revisión y plantilla del sílabo' USING ERRCODE = '23514';
                END IF;
                IF TG_OP = 'UPDATE' AND OLD.estado = 'completed' AND NEW IS DISTINCT FROM OLD THEN
                    RAISE EXCEPTION 'Un artefacto completado es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_artefacto_exportacion
            BEFORE INSERT OR UPDATE OR DELETE ON artefactos_exportacion
            FOR EACH ROW EXECUTE FUNCTION validar_artefacto_exportacion();

            CREATE OR REPLACE FUNCTION proteger_notificacion_interna() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
                   OR NEW.clave_deduplicacion IS DISTINCT FROM OLD.clave_deduplicacion
                   OR NEW.tipo IS DISTINCT FROM OLD.tipo
                   OR NEW.titulo IS DISTINCT FROM OLD.titulo
                   OR NEW.mensaje IS DISTINCT FROM OLD.mensaje
                   OR NEW.tipo_recurso IS DISTINCT FROM OLD.tipo_recurso
                   OR NEW.recurso_id IS DISTINCT FROM OLD.recurso_id
                   OR NEW.creado_en IS DISTINCT FROM OLD.creado_en THEN
                    RAISE EXCEPTION 'El contenido de la notificación es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_notificacion_interna
            BEFORE UPDATE OR DELETE ON notificaciones_internas
            FOR EACH ROW EXECUTE FUNCTION proteger_notificacion_interna();

            CREATE OR REPLACE FUNCTION proteger_payload_outbox() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.tipo_agregado IS DISTINCT FROM OLD.tipo_agregado
                   OR NEW.agregado_id IS DISTINCT FROM OLD.agregado_id
                   OR NEW.tipo_evento IS DISTINCT FROM OLD.tipo_evento
                   OR NEW.clave_deduplicacion IS DISTINCT FROM OLD.clave_deduplicacion
                   OR NEW.payload IS DISTINCT FROM OLD.payload
                   OR NEW.ocurrido_en IS DISTINCT FROM OLD.ocurrido_en THEN
                    RAISE EXCEPTION 'La identidad y payload del outbox son inmutables' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_evento_outbox
            BEFORE UPDATE OR DELETE ON eventos_outbox
            FOR EACH ROW EXECUTE FUNCTION proteger_payload_outbox();

            CREATE TRIGGER proteger_objeto_almacenado
            BEFORE UPDATE OR DELETE ON objetos_almacenados
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();

            CREATE TRIGGER proteger_evento_auditoria_db
            BEFORE UPDATE OR DELETE ON eventos_auditoria
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_payload_outbox() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_notificacion_interna() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_artefacto_exportacion() CASCADE');
        Schema::dropIfExists('eventos_outbox');
        Schema::dropIfExists('notificaciones_internas');
        Schema::dropIfExists('artefactos_exportacion');
        Schema::dropIfExists('objetos_almacenados');
        Schema::table('ejecuciones_trabajo', function (Blueprint $table) {
            $table->dropIndex(['resource_type', 'resource_id']);
            $table->dropIndex(['queue_name', 'status', 'created_at']);
            $table->dropColumn(['queue_name', 'resource_type', 'resource_id', 'max_attempts']);
        });
    }
};
