<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Convierte las fuentes académicas en documentos de coordinación (I-26).
 *
 * Una fuente deja de ser un expediente versionado con fragmentos y conflictos: es un
 * solo documento Markdown con nombre, descripción y notas internas, editado por la
 * Coordinación de la carrera. Las convocatorias fijan la fuente y la evidencia de IA
 * conserva su propia fotografía (nombre, extracto y huella), por lo que editar la
 * fuente después no reescribe análisis pasados.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Los triggers que vigilaban versiones y fragmentos sobrevivirían al borrado.
        DB::unprepared('DROP FUNCTION IF EXISTS validar_evidencia_ia() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_fragmento_fuente_activa() CASCADE');

        Schema::table('fuentes_academicas', function (Blueprint $table) {
            $table->text('notas_internas')->nullable();
            $table->text('contenido')->nullable();
        });

        $this->composeContentFromFragments();
        $this->repointConvocationPins();
        $this->reshapeAiEvidence();

        Schema::dropIfExists('conflictos_fuente');
        Schema::dropIfExists('fragmentos_fuente');
        Schema::dropIfExists('versiones_fuente');

        Schema::table('fuentes_academicas', function (Blueprint $table) {
            $table->dropColumn(['tipo', 'autoridad', 'responsable']);
        });

        $this->redefineEvidenceValidation();
    }

    /**
     * El contenido existente no se pierde: la versión más representativa de cada fuente
     * (la activa, o la más reciente) se aplana a Markdown, fragmento por fragmento.
     */
    private function composeContentFromFragments(): void
    {
        foreach (DB::table('fuentes_academicas')->pluck('id') as $sourceId) {
            $version = DB::table('versiones_fuente')
                ->where('fuente_academica_id', $sourceId)
                ->orderByRaw("(estado = 'active') DESC, numero_version DESC")
                ->first();

            if ($version === null) {
                continue;
            }

            $sections = [];
            $fragments = DB::table('fragmentos_fuente')
                ->where('version_fuente_id', $version->id)
                ->orderBy('posicion')
                ->get();
            foreach ($fragments as $fragment) {
                $body = $fragment->contenido;
                if (! is_string($body) || trim($body) === '') {
                    $decoded = json_decode((string) $fragment->valor_estructurado, true);
                    $body = $decoded === null ? null : "```json\n".json_encode(
                        $decoded,
                        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
                    )."\n```";
                }
                if ($body === null) {
                    continue;
                }
                $sections[] = "## {$fragment->titulo}\n\n{$body}";
            }

            if ($sections !== []) {
                DB::table('fuentes_academicas')
                    ->where('id', $sourceId)
                    ->update(['contenido' => implode("\n\n", $sections), 'updated_at' => now()]);
            }
        }
    }

    /** Las convocatorias pasan de fijar una versión concreta a fijar la fuente. */
    private function repointConvocationPins(): void
    {
        Schema::table('fuentes_convocatoria', function (Blueprint $table) {
            $table->foreignUuid('fuente_academica_id')
                ->nullable()
                ->constrained('fuentes_academicas')
                ->restrictOnDelete();
        });

        DB::statement(<<<'SQL'
            UPDATE fuentes_convocatoria fc
            SET fuente_academica_id = vf.fuente_academica_id
            FROM versiones_fuente vf
            WHERE vf.id = fc.version_fuente_id
            SQL);

        // Dos versiones de la misma fuente en una convocatoria colapsan en una fila.
        DB::statement(<<<'SQL'
            DELETE FROM fuentes_convocatoria a
            USING fuentes_convocatoria b
            WHERE a.convocatoria_id = b.convocatoria_id
              AND a.fuente_academica_id = b.fuente_academica_id
              AND a.ctid > b.ctid
            SQL);

        DB::statement('ALTER TABLE fuentes_convocatoria ALTER COLUMN fuente_academica_id SET NOT NULL');
        Schema::table('fuentes_convocatoria', function (Blueprint $table) {
            $table->dropColumn('version_fuente_id');
            $table->unique(['convocatoria_id', 'fuente_academica_id']);
        });
    }

    /**
     * La evidencia ya guardaba su propia copia (nombre, extracto y huella); solo pierden
     * sentido las columnas que apuntaban a versiones y fragmentos. Las filas históricas
     * conservan su fotografía intacta bajo el nuevo nombre de la huella.
     */
    private function reshapeAiEvidence(): void
    {
        Schema::table('evidencias_ia', function (Blueprint $table) {
            $table->dropColumn([
                'version_fuente_id',
                'fragmento_fuente_id',
                'autoridad_fuente',
                'numero_version',
                'clave_fragmento',
                'titulo_fragmento',
                'clave_dato',
            ]);
        });
        DB::statement('ALTER TABLE evidencias_ia RENAME COLUMN huella_fragmento TO huella_contenido');
    }

    /**
     * Misma regla que fijó I-06, sin versiones: una evidencia solo puede citar una
     * fuente activa fijada por la convocatoria del expediente, y solo mientras la
     * ejecución sigue pendiente.
     */
    private function redefineEvidenceValidation(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION validar_evidencia_ia() RETURNS trigger AS $$
            DECLARE
                carrera_fuente uuid;
                carrera_silabo uuid;
                fuente_activa boolean;
                convocatoria_silabo uuid;
                estado_ejecucion text;
            BEGIN
                SELECT activo, carrera_id INTO fuente_activa, carrera_fuente
                FROM fuentes_academicas WHERE id = NEW.fuente_academica_id;
                SELECT s.convocatoria_id, c.carrera_id, e.estado
                INTO convocatoria_silabo, carrera_silabo, estado_ejecucion
                FROM ejecuciones_ia e
                JOIN silabos s ON s.id = e.silabo_id
                JOIN convocatorias c ON c.id = s.convocatoria_id
                WHERE e.id = NEW.ejecucion_ia_id;

                IF carrera_fuente IS DISTINCT FROM carrera_silabo
                   OR fuente_activa IS DISTINCT FROM TRUE
                   OR estado_ejecucion IS DISTINCT FROM 'pending'
                   OR NOT EXISTS (
                       SELECT 1 FROM fuentes_convocatoria
                       WHERE convocatoria_id = convocatoria_silabo
                         AND fuente_academica_id = NEW.fuente_academica_id
                   ) THEN
                    RAISE EXCEPTION 'La evidencia debe citar una fuente activa fijada por la convocatoria' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER validar_evidencia_ia
            BEFORE INSERT ON evidencias_ia
            FOR EACH ROW EXECUTE FUNCTION validar_evidencia_ia();
            SQL);
    }

    public function down(): void
    {
        // Sin reverso: recuperar el versionado sería reconstruir el módulo anterior.
    }
};
