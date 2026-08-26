<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ejecuciones_importacion', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('ejecucion_trabajo_id')->nullable()->unique()->constrained('ejecuciones_trabajo')->restrictOnDelete();
            $table->string('origen', 100);
            $table->string('perfil', 80);
            $table->string('modo', 24)->default('simulation');
            $table->string('version_contrato', 40);
            $table->string('version_lector_solicitada', 80);
            $table->string('version_lector_ejecutada', 80)->nullable();
            $table->string('version_mapper', 80);
            $table->string('version_reconciliador', 80);
            $table->uuid('clave_idempotencia');
            $table->string('estado', 24)->default('pending');
            $table->jsonb('parametros');
            $table->char('huella_entrada', 64)->nullable();
            $table->unsignedInteger('total_items')->default(0);
            $table->unsignedInteger('items_validos')->default(0);
            $table->unsignedInteger('items_rechazados')->default(0);
            $table->unsignedInteger('conflictos')->default(0);
            $table->unsignedInteger('altas_propuestas')->default(0);
            $table->unsignedInteger('cambios_propuestos')->default(0);
            $table->unsignedInteger('sin_cambio_propuesto')->default(0);
            $table->string('codigo_error', 80)->nullable();
            $table->text('mensaje_error')->nullable();
            $table->foreignUuid('solicitado_por')->constrained('usuarios')->restrictOnDelete();
            $table->foreignUuid('asignacion_rol_id')->nullable()->constrained('asignaciones_rol')->restrictOnDelete();
            $table->timestampTz('solicitado_en');
            $table->timestampTz('iniciado_en')->nullable();
            $table->timestampTz('completado_en')->nullable();
            $table->timestampsTz();

            $table->unique(
                ['origen', 'perfil', 'clave_idempotencia'],
                'importacion_idempotencia_unica',
            );
            $table->index(['estado', 'solicitado_en'], 'importacion_estado_idx');
        });

        Schema::create('items_importacion', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('ejecucion_importacion_id')->constrained('ejecuciones_importacion')->restrictOnDelete();
            $table->unsignedInteger('numero_fila');
            $table->string('referencia_externa', 180);
            $table->string('tipo_entidad', 60);
            $table->jsonb('payload_original');
            $table->char('huella_original', 64);
            $table->jsonb('payload_normalizado')->nullable();
            $table->char('huella_normalizada', 64)->nullable();
            $table->string('resultado', 24);
            $table->string('accion_propuesta', 24)->nullable();
            $table->string('codigo_motivo', 80);
            $table->string('tipo_candidato', 80)->nullable();
            $table->uuid('candidato_id')->nullable();
            $table->timestampTz('created_at');

            $table->unique(
                ['ejecucion_importacion_id', 'numero_fila'],
                'item_importacion_fila_unica',
            );
            $table->index(
                ['ejecucion_importacion_id', 'resultado'],
                'item_importacion_resultado_idx',
            );
        });

        Schema::create('conflictos_importacion', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('ejecucion_importacion_id')->constrained('ejecuciones_importacion')->restrictOnDelete();
            $table->foreignUuid('item_importacion_id')->unique()->constrained('items_importacion')->restrictOnDelete();
            $table->string('tipo', 80);
            $table->jsonb('candidatos');
            $table->string('estado', 24)->default('pending');
            $table->string('decision', 24)->nullable();
            $table->text('justificacion')->nullable();
            $table->foreignUuid('resuelto_por')->nullable()->constrained('usuarios')->restrictOnDelete();
            $table->timestampTz('resuelto_en')->nullable();
            $table->timestampTz('created_at');

            $table->index(
                ['ejecucion_importacion_id', 'estado'],
                'conflicto_importacion_estado_idx',
            );
        });

        DB::statement("ALTER TABLE ejecuciones_importacion ADD CONSTRAINT ejecuciones_importacion_modo_check CHECK (modo = 'simulation')");
        DB::statement("ALTER TABLE ejecuciones_importacion ADD CONSTRAINT ejecuciones_importacion_estado_check CHECK (estado IN ('pending', 'running', 'completed', 'failed'))");
        DB::statement(<<<'SQL'
            ALTER TABLE ejecuciones_importacion ADD CONSTRAINT ejecuciones_importacion_terminal_check CHECK (
                (estado = 'completed'
                    AND version_lector_ejecutada IS NOT NULL
                    AND huella_entrada IS NOT NULL
                    AND completado_en IS NOT NULL
                    AND codigo_error IS NULL
                    AND mensaje_error IS NULL
                    AND total_items = items_validos + items_rechazados
                    AND conflictos <= items_validos
                    AND altas_propuestas + cambios_propuestos + sin_cambio_propuesto <= items_validos)
                OR (estado = 'failed'
                    AND completado_en IS NOT NULL
                    AND codigo_error IS NOT NULL
                    AND mensaje_error IS NOT NULL)
                OR estado IN ('pending', 'running')
            )
            SQL);
        DB::statement("ALTER TABLE items_importacion ADD CONSTRAINT items_importacion_resultado_check CHECK (resultado IN ('new', 'change', 'unchanged', 'rejected', 'conflict'))");
        DB::statement("ALTER TABLE items_importacion ADD CONSTRAINT items_importacion_accion_check CHECK (accion_propuesta IS NULL OR accion_propuesta IN ('create', 'update', 'none'))");
        DB::statement(<<<'SQL'
            ALTER TABLE items_importacion ADD CONSTRAINT items_importacion_normalizado_check CHECK (
                (resultado = 'rejected' AND payload_normalizado IS NULL AND huella_normalizada IS NULL)
                OR (resultado <> 'rejected' AND payload_normalizado IS NOT NULL AND huella_normalizada IS NOT NULL)
            )
            SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE items_importacion ADD CONSTRAINT items_importacion_candidato_check CHECK (
                (tipo_candidato IS NULL AND candidato_id IS NULL)
                OR (tipo_candidato IS NOT NULL AND candidato_id IS NOT NULL)
            )
            SQL);
        DB::statement("ALTER TABLE conflictos_importacion ADD CONSTRAINT conflictos_importacion_estado_check CHECK (estado IN ('pending', 'resolved'))");
        DB::statement("ALTER TABLE conflictos_importacion ADD CONSTRAINT conflictos_importacion_decision_check CHECK (decision IS NULL OR decision = 'exclude')");
        DB::statement(<<<'SQL'
            ALTER TABLE conflictos_importacion ADD CONSTRAINT conflictos_importacion_resolucion_check CHECK (
                (estado = 'pending'
                    AND decision IS NULL
                    AND justificacion IS NULL
                    AND resuelto_por IS NULL
                    AND resuelto_en IS NULL)
                OR (estado = 'resolved'
                    AND decision = 'exclude'
                    AND char_length(justificacion) BETWEEN 20 AND 2000
                    AND resuelto_por IS NOT NULL
                    AND resuelto_en IS NOT NULL)
            )
            SQL);

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION validar_ejecucion_importacion() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'UPDATE' THEN
                    IF OLD.estado IN ('completed', 'failed') THEN
                        RAISE EXCEPTION 'Una ejecución de importación terminal es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF NEW.id IS DISTINCT FROM OLD.id
                       OR NEW.origen IS DISTINCT FROM OLD.origen
                       OR NEW.perfil IS DISTINCT FROM OLD.perfil
                       OR NEW.modo IS DISTINCT FROM OLD.modo
                       OR NEW.version_contrato IS DISTINCT FROM OLD.version_contrato
                       OR NEW.version_lector_solicitada IS DISTINCT FROM OLD.version_lector_solicitada
                       OR NEW.version_mapper IS DISTINCT FROM OLD.version_mapper
                       OR NEW.version_reconciliador IS DISTINCT FROM OLD.version_reconciliador
                       OR NEW.clave_idempotencia IS DISTINCT FROM OLD.clave_idempotencia
                       OR NEW.parametros IS DISTINCT FROM OLD.parametros
                       OR NEW.solicitado_por IS DISTINCT FROM OLD.solicitado_por
                       OR NEW.asignacion_rol_id IS DISTINCT FROM OLD.asignacion_rol_id
                       OR NEW.solicitado_en IS DISTINCT FROM OLD.solicitado_en THEN
                        RAISE EXCEPTION 'La entrada fijada de importación es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF OLD.ejecucion_trabajo_id IS NOT NULL
                       AND NEW.ejecucion_trabajo_id IS DISTINCT FROM OLD.ejecucion_trabajo_id THEN
                        RAISE EXCEPTION 'El trabajo asociado a la importación es inmutable' USING ERRCODE = '23514';
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_y_proteger_ejecucion_importacion
            BEFORE INSERT OR UPDATE ON ejecuciones_importacion
            FOR EACH ROW EXECUTE FUNCTION validar_ejecucion_importacion();
            CREATE TRIGGER proteger_eliminacion_ejecucion_importacion
            BEFORE DELETE ON ejecuciones_importacion
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();

            CREATE OR REPLACE FUNCTION validar_item_importacion() RETURNS trigger AS $$
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT estado INTO estado_ejecucion
                FROM ejecuciones_importacion WHERE id = NEW.ejecucion_importacion_id;
                IF estado_ejecucion IS DISTINCT FROM 'running' THEN
                    RAISE EXCEPTION 'Los items solo se fijan durante una importación en ejecución' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_item_importacion
            BEFORE INSERT ON items_importacion
            FOR EACH ROW EXECUTE FUNCTION validar_item_importacion();
            CREATE TRIGGER proteger_item_importacion
            BEFORE UPDATE OR DELETE ON items_importacion
            FOR EACH ROW EXECUTE FUNCTION proteger_registro_append_only();

            CREATE OR REPLACE FUNCTION validar_conflicto_importacion() RETURNS trigger AS $$
            DECLARE ejecucion_item uuid;
            DECLARE resultado_item text;
            DECLARE estado_ejecucion text;
            BEGIN
                SELECT ejecucion_importacion_id, resultado
                INTO ejecucion_item, resultado_item
                FROM items_importacion WHERE id = NEW.item_importacion_id;
                SELECT estado INTO estado_ejecucion
                FROM ejecuciones_importacion WHERE id = NEW.ejecucion_importacion_id;
                IF ejecucion_item IS DISTINCT FROM NEW.ejecucion_importacion_id
                   OR resultado_item IS DISTINCT FROM 'conflict'
                   OR estado_ejecucion IS DISTINCT FROM 'running' THEN
                    RAISE EXCEPTION 'El conflicto no corresponde a un item conflictivo de la ejecución' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_conflicto_importacion
            BEFORE INSERT ON conflictos_importacion
            FOR EACH ROW EXECUTE FUNCTION validar_conflicto_importacion();

            CREATE OR REPLACE FUNCTION proteger_conflicto_importacion() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR OLD.estado = 'resolved'
                   OR NEW.id IS DISTINCT FROM OLD.id
                   OR NEW.ejecucion_importacion_id IS DISTINCT FROM OLD.ejecucion_importacion_id
                   OR NEW.item_importacion_id IS DISTINCT FROM OLD.item_importacion_id
                   OR NEW.tipo IS DISTINCT FROM OLD.tipo
                   OR NEW.candidatos IS DISTINCT FROM OLD.candidatos
                   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
                    RAISE EXCEPTION 'La identidad o contenido del conflicto de importación es inmutable' USING ERRCODE = '23514';
                END IF;
                IF NEW.estado IS DISTINCT FROM 'resolved' THEN
                    RAISE EXCEPTION 'La única transición permitida resuelve el conflicto' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER proteger_conflicto_importacion
            BEFORE UPDATE OR DELETE ON conflictos_importacion
            FOR EACH ROW EXECUTE FUNCTION proteger_conflicto_importacion();
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_conflicto_importacion() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_conflicto_importacion() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_item_importacion() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_ejecucion_importacion() CASCADE');
        Schema::dropIfExists('conflictos_importacion');
        Schema::dropIfExists('items_importacion');
        Schema::dropIfExists('ejecuciones_importacion');
    }
};
