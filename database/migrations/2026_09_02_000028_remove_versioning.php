<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adiós a las versiones (I-32).
 *
 * Cada revisión enviada guarda una copia completa de la plantilla con la que se hizo, y
 * los sílabos sin enviar se borran cuando la plantilla o la malla cambian. Con eso, las
 * versiones ya no protegen nada: solo añadían botones y estados. La plantilla pasa a ser
 * una sola que se edita en el sitio; la malla, que ya era una por carrera, deja de
 * llamarse «versión».
 *
 * Datos: se conserva la última versión publicada de cada plantilla (o la última si no
 * hay publicada) y se descartan las demás. Si algún sílabo, convocatoria, proceso,
 * exportación o ejecución de IA apunta a una versión descartada, la migración se detiene:
 * ese caso requiere decisión humana, no un borrado silencioso.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->dropPublishedGuards();
        $this->flattenTemplates();
        $this->flattenCurricula();
        $this->recreateConsistencyTriggers(usingVersions: false);
    }

    public function down(): void
    {
        throw new RuntimeException(
            'La migración 000028 descarta las versiones de plantilla y malla y no se revierte automáticamente. Restaure el respaldo previo.',
        );
    }

    /** Los guardas de «versión publicada» dejan de tener sentido: la plantilla se edita en el sitio. */
    private function dropPublishedGuards(): void
    {
        DB::unprepared(<<<'SQL'
            DROP TRIGGER IF EXISTS proteger_version_plantilla_publicada ON versiones_plantilla;
            DROP TRIGGER IF EXISTS proteger_seccion_plantilla_publicada ON secciones_plantilla;
            DROP TRIGGER IF EXISTS proteger_bloque_plantilla_publicada ON bloques_plantilla;
            DROP TRIGGER IF EXISTS proteger_campo_plantilla_publicada ON definiciones_campo;
            DROP FUNCTION IF EXISTS proteger_configuracion_publicada();
            SQL);
    }

    private function flattenTemplates(): void
    {
        Schema::table('plantillas_silabo', function (Blueprint $table): void {
            $table->jsonb('mapeo_documento')->nullable();
        });

        foreach (['secciones_plantilla', 'bloques_plantilla', 'definiciones_campo', 'silabos', 'convocatorias', 'procesos_silabos', 'artefactos_exportacion', 'ejecuciones_ia'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->uuid('plantilla_id')->nullable();
            });
        }

        $templates = DB::table('plantillas_silabo')->get(['id']);
        foreach ($templates as $template) {
            $canonical = DB::table('versiones_plantilla')
                ->where('plantilla_id', $template->id)
                ->orderByRaw("CASE WHEN estado = 'publicada' THEN 0 ELSE 1 END")
                ->orderByDesc('numero_version')
                ->first();

            if ($canonical === null) {
                continue;
            }

            $discarded = DB::table('versiones_plantilla')
                ->where('plantilla_id', $template->id)
                ->where('id', '!=', $canonical->id)
                ->pluck('id');

            foreach (['silabos', 'convocatorias', 'procesos_silabos', 'artefactos_exportacion', 'ejecuciones_ia'] as $dependent) {
                if ($discarded->isNotEmpty() && DB::table($dependent)->whereIn('version_plantilla_id', $discarded)->exists()) {
                    throw new RuntimeException(
                        "La tabla {$dependent} tiene filas apoyadas en versiones de plantilla que no son la vigente. Resuélvalas antes de retirar las versiones.",
                    );
                }
            }

            DB::table('plantillas_silabo')->where('id', $template->id)->update([
                'mapeo_documento' => $canonical->mapeo_documento,
            ]);

            foreach (['secciones_plantilla', 'bloques_plantilla', 'definiciones_campo', 'silabos', 'convocatorias', 'procesos_silabos', 'artefactos_exportacion', 'ejecuciones_ia'] as $tableName) {
                DB::table($tableName)
                    ->where('version_plantilla_id', $canonical->id)
                    ->update(['plantilla_id' => $template->id]);
            }

            // Las versiones descartadas se llevan su estructura (cascada) y nada más:
            // ya se comprobó que ningún expediente las usa.
            if ($discarded->isNotEmpty()) {
                DB::table('versiones_plantilla')->whereIn('id', $discarded)->delete();
            }
        }

        // Los triggers de consistencia leen `version_plantilla_id`; se rehacen después.
        DB::unprepared(<<<'SQL'
            DROP TRIGGER IF EXISTS validar_y_proteger_ejecucion_ia ON ejecuciones_ia;
            DROP TRIGGER IF EXISTS validar_artefacto_exportacion ON artefactos_exportacion;
            SQL);

        foreach ([
            'secciones_plantilla' => 'secciones_plantilla_version_plantilla_id_foreign',
            'bloques_plantilla' => 'bloques_plantilla_version_plantilla_id_foreign',
            'definiciones_campo' => 'definiciones_campo_version_plantilla_id_foreign',
            'silabos' => 'silabos_version_plantilla_id_foreign',
            'convocatorias' => 'campanias_version_plantilla_id_foreign',
            'procesos_silabos' => 'procesos_silabos_version_plantilla_id_foreign',
            'artefactos_exportacion' => 'artefactos_exportacion_version_plantilla_id_foreign',
            'ejecuciones_ia' => 'ejecuciones_ia_version_plantilla_id_foreign',
        ] as $tableName => $foreignKey) {
            DB::statement("ALTER TABLE {$tableName} DROP CONSTRAINT IF EXISTS {$foreignKey}");
        }
        DB::statement('ALTER TABLE secciones_plantilla DROP CONSTRAINT IF EXISTS secciones_plantilla_version_plantilla_id_clave_unique');
        DB::statement('ALTER TABLE secciones_plantilla DROP CONSTRAINT IF EXISTS secciones_plantilla_version_plantilla_id_posicion_unique');
        DB::statement('ALTER TABLE bloques_plantilla DROP CONSTRAINT IF EXISTS bloques_plantilla_version_plantilla_id_clave_unique');
        DB::statement('ALTER TABLE definiciones_campo DROP CONSTRAINT IF EXISTS definiciones_campo_version_plantilla_id_clave_unique');

        foreach (['secciones_plantilla', 'bloques_plantilla', 'definiciones_campo', 'silabos', 'convocatorias', 'procesos_silabos', 'artefactos_exportacion', 'ejecuciones_ia'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropColumn('version_plantilla_id');
            });
            DB::statement("ALTER TABLE {$tableName} ALTER COLUMN plantilla_id SET NOT NULL");
        }

        DB::statement('ALTER TABLE secciones_plantilla ADD CONSTRAINT secciones_plantilla_plantilla_id_foreign FOREIGN KEY (plantilla_id) REFERENCES plantillas_silabo(id) ON DELETE CASCADE');
        DB::statement('ALTER TABLE bloques_plantilla ADD CONSTRAINT bloques_plantilla_plantilla_id_foreign FOREIGN KEY (plantilla_id) REFERENCES plantillas_silabo(id) ON DELETE CASCADE');
        DB::statement('ALTER TABLE definiciones_campo ADD CONSTRAINT definiciones_campo_plantilla_id_foreign FOREIGN KEY (plantilla_id) REFERENCES plantillas_silabo(id) ON DELETE CASCADE');
        foreach (['silabos', 'convocatorias', 'procesos_silabos', 'artefactos_exportacion', 'ejecuciones_ia'] as $tableName) {
            DB::statement("ALTER TABLE {$tableName} ADD CONSTRAINT {$tableName}_plantilla_id_foreign FOREIGN KEY (plantilla_id) REFERENCES plantillas_silabo(id) ON DELETE RESTRICT");
        }
        DB::statement('ALTER TABLE secciones_plantilla ADD CONSTRAINT secciones_plantilla_plantilla_id_clave_unique UNIQUE (plantilla_id, clave)');
        DB::statement('ALTER TABLE secciones_plantilla ADD CONSTRAINT secciones_plantilla_plantilla_id_posicion_unique UNIQUE (plantilla_id, posicion)');
        DB::statement('ALTER TABLE bloques_plantilla ADD CONSTRAINT bloques_plantilla_plantilla_id_clave_unique UNIQUE (plantilla_id, clave)');
        DB::statement('ALTER TABLE definiciones_campo ADD CONSTRAINT definiciones_campo_plantilla_id_clave_unique UNIQUE (plantilla_id, clave)');

        Schema::dropIfExists('versiones_plantilla');
    }

    private function flattenCurricula(): void
    {
        $duplicated = DB::table('versiones_malla')
            ->select('carrera_id')
            ->groupBy('carrera_id')
            ->havingRaw('count(*) > 1')
            ->exists();
        if ($duplicated) {
            throw new RuntimeException(
                'Hay carreras con más de una fila en versiones_malla. Conserve una por carrera antes de retirar las versiones.',
            );
        }

        DB::statement('DROP INDEX IF EXISTS versiones_malla_actual_carrera_unique');
        DB::statement('ALTER TABLE versiones_malla DROP CONSTRAINT IF EXISTS versiones_malla_carrera_id_numero_version_unique');
        DB::statement('ALTER TABLE versiones_malla DROP CONSTRAINT IF EXISTS versiones_malla_estado_check');
        DB::statement("UPDATE versiones_malla SET estado = 'inactiva' WHERE estado = 'historica'");

        Schema::table('versiones_malla', function (Blueprint $table): void {
            $table->dropColumn(['numero_version', 'es_actual', 'publicado_en']);
        });

        Schema::rename('versiones_malla', 'mallas');
        DB::statement("ALTER TABLE mallas ADD CONSTRAINT mallas_estado_check CHECK (estado IN ('activa', 'inactiva'))");
        DB::statement('ALTER TABLE mallas ADD CONSTRAINT mallas_carrera_id_unique UNIQUE (carrera_id)');
        DB::statement('ALTER INDEX IF EXISTS versiones_malla_pkey RENAME TO mallas_pkey');
        DB::statement('ALTER TABLE mallas RENAME CONSTRAINT versiones_malla_carrera_id_codigo_unique TO mallas_carrera_id_codigo_unique');
        DB::statement('ALTER TABLE mallas RENAME CONSTRAINT versiones_malla_numero_ciclos_check TO mallas_numero_ciclos_check');
        DB::statement('ALTER TABLE mallas RENAME CONSTRAINT versiones_malla_carrera_id_foreign TO mallas_carrera_id_foreign');
        DB::statement('ALTER INDEX IF EXISTS versiones_malla_codigo_institucional_unico RENAME TO mallas_codigo_institucional_unico');

        foreach ([
            'asignaturas' => 'asignaturas_version_malla_id_foreign',
            'definiciones_campo_malla' => 'definiciones_campo_malla_version_malla_id_foreign',
            'silabos' => 'silabos_version_malla_id_foreign',
        ] as $tableName => $foreignKey) {
            DB::statement("ALTER TABLE {$tableName} RENAME COLUMN version_malla_id TO malla_id");
            DB::statement("ALTER TABLE {$tableName} RENAME CONSTRAINT {$foreignKey} TO {$tableName}_malla_id_foreign");
        }
        DB::statement('ALTER TABLE asignaturas RENAME CONSTRAINT asignaturas_version_malla_id_codigo_institucional_unique TO asignaturas_malla_id_codigo_institucional_unique');
        DB::statement('ALTER TABLE definiciones_campo_malla RENAME CONSTRAINT definiciones_campo_malla_version_malla_id_clave_sistema_unique TO definiciones_campo_malla_malla_id_clave_sistema_unique');
        DB::statement('ALTER TABLE definiciones_campo_malla RENAME CONSTRAINT definiciones_campo_malla_version_malla_id_clave_unique TO definiciones_campo_malla_malla_id_clave_unique');
        DB::statement('ALTER INDEX IF EXISTS definiciones_campo_malla_version_malla_id_posicion_index RENAME TO definiciones_campo_malla_malla_id_posicion_index');
    }

    /** Los mismos guardas de coherencia de antes, leyendo `plantilla_id`. */
    private function recreateConsistencyTriggers(bool $usingVersions): void
    {
        $column = $usingVersions ? 'version_plantilla_id' : 'plantilla_id';

        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION validar_ejecucion_ia() RETURNS trigger AS \$\$
            DECLARE
                plantilla_silabo uuid;
                plantilla_campo uuid;
            BEGIN
                SELECT {$column} INTO plantilla_silabo
                FROM silabos WHERE id = NEW.silabo_id;
                SELECT {$column} INTO plantilla_campo
                FROM definiciones_campo WHERE id = NEW.definicion_campo_id;

                IF plantilla_silabo IS DISTINCT FROM NEW.{$column}
                   OR plantilla_campo IS DISTINCT FROM NEW.{$column} THEN
                    RAISE EXCEPTION 'La ejecución de IA no coincide con la plantilla y campo del sílabo' USING ERRCODE = '23514';
                END IF;

                IF TG_OP = 'UPDATE' THEN
                    IF OLD.estado IN ('completada', 'no_concluyente', 'fallida') THEN
                        RAISE EXCEPTION 'Una ejecución de IA terminal es inmutable' USING ERRCODE = '23514';
                    END IF;
                    IF NEW.id IS DISTINCT FROM OLD.id
                       OR NEW.silabo_id IS DISTINCT FROM OLD.silabo_id
                       OR NEW.definicion_campo_id IS DISTINCT FROM OLD.definicion_campo_id
                       OR NEW.{$column} IS DISTINCT FROM OLD.{$column}
                       OR NEW.clave_idempotencia IS DISTINCT FROM OLD.clave_idempotencia
                       OR NEW.clave_funcional IS DISTINCT FROM OLD.clave_funcional
                       OR NEW.version_contrato IS DISTINCT FROM OLD.version_contrato
                       OR NEW.version_instruccion IS DISTINCT FROM OLD.version_instruccion
                       OR NEW.version_pasarela_solicitada IS DISTINCT FROM OLD.version_pasarela_solicitada
                       OR NEW.idioma IS DISTINCT FROM OLD.idioma
                       OR NEW.contenido_entrada IS DISTINCT FROM OLD.contenido_entrada
                       OR NEW.huella_contenido IS DISTINCT FROM OLD.huella_contenido
                       OR NEW.huella_conjunto_fuentes IS DISTINCT FROM OLD.huella_conjunto_fuentes
                       OR NEW.metadatos_entrada IS DISTINCT FROM OLD.metadatos_entrada
                       OR NEW.version_bloqueo_origen IS DISTINCT FROM OLD.version_bloqueo_origen
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
            \$\$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_y_proteger_ejecucion_ia
            BEFORE INSERT OR UPDATE ON ejecuciones_ia
            FOR EACH ROW EXECUTE FUNCTION validar_ejecucion_ia();

            CREATE OR REPLACE FUNCTION validar_artefacto_exportacion() RETURNS trigger AS \$\$
            DECLARE
                silabo_revision uuid;
                plantilla_silabo uuid;
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    RAISE EXCEPTION 'Un artefacto de exportación no puede eliminarse' USING ERRCODE = '23514';
                END IF;
                SELECT r.silabo_id, s.{$column}
                INTO silabo_revision, plantilla_silabo
                FROM revisiones_silabo r
                JOIN silabos s ON s.id = r.silabo_id
                WHERE r.id = NEW.revision_silabo_id;
                IF silabo_revision IS DISTINCT FROM NEW.silabo_id
                   OR plantilla_silabo IS DISTINCT FROM NEW.{$column} THEN
                    RAISE EXCEPTION 'El artefacto no coincide con la revisión y plantilla del sílabo' USING ERRCODE = '23514';
                END IF;
                IF TG_OP = 'UPDATE' AND OLD.estado = 'completado' AND NEW IS DISTINCT FROM OLD THEN
                    RAISE EXCEPTION 'Un artefacto completado es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_artefacto_exportacion
            BEFORE INSERT OR UPDATE OR DELETE ON artefactos_exportacion
            FOR EACH ROW EXECUTE FUNCTION validar_artefacto_exportacion();
            SQL);
    }
};
