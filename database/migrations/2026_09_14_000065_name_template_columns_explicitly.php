<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** @var list<array{string, string, string}> */
    private const RENAMES = [
        ['plantillas_silabo', 'nombre', 'nombre_plantilla_silabo'],
        ['plantillas_silabo', 'descripcion', 'descripcion_plantilla_silabo'],
        ['plantillas_silabo', 'activo', 'plantilla_silabo_activa'],
        ['plantillas_silabo', 'mapeo_documento', 'mapeo_documento_plantilla'],
        ['secciones_plantilla', 'clave', 'clave_seccion_plantilla'],
        ['secciones_plantilla', 'titulo', 'titulo_seccion_plantilla'],
        ['secciones_plantilla', 'descripcion', 'descripcion_seccion_plantilla'],
        ['secciones_plantilla', 'posicion', 'posicion_seccion_plantilla'],
        ['bloques_plantilla', 'clave', 'clave_bloque_plantilla'],
        ['bloques_plantilla', 'tipo', 'tipo_bloque_plantilla'],
        ['bloques_plantilla', 'titulo', 'titulo_bloque_plantilla'],
        ['bloques_plantilla', 'configuracion', 'configuracion_bloque_plantilla'],
        ['bloques_plantilla', 'posicion', 'posicion_bloque_plantilla'],
        ['definiciones_campo', 'clave', 'clave_definicion_campo'],
        ['definiciones_campo', 'etiqueta', 'etiqueta_definicion_campo'],
        ['definiciones_campo', 'ayuda', 'ayuda_definicion_campo'],
        ['definiciones_campo', 'tipo', 'tipo_definicion_campo'],
        ['definiciones_campo', 'reglas', 'reglas_definicion_campo'],
        ['definiciones_campo', 'opciones', 'opciones_definicion_campo'],
        ['definiciones_campo', 'posicion', 'posicion_definicion_campo'],
        ['fuentes_academicas', 'nombre', 'nombre_fuente_academica'],
        ['fuentes_academicas', 'descripcion', 'descripcion_fuente_academica'],
        ['fuentes_academicas', 'activo', 'fuente_academica_activa'],
        ['fuentes_academicas', 'contenido', 'contenido_fuente_academica'],
    ];

    /** @var list<array{string, string}> */
    private const INDEX_RENAMES = [
        ['plantillas_silabo_activo_index', 'plantillas_silabo_activa_index'],
        ['secciones_plantilla_plantilla_id_clave_unique', 'secciones_plantilla_plantilla_id_clave_seccion_unique'],
        ['secciones_plantilla_plantilla_id_posicion_unique', 'secciones_plantilla_plantilla_id_posicion_seccion_unique'],
        ['bloques_plantilla_plantilla_id_clave_unique', 'bloques_plantilla_plantilla_id_clave_bloque_unique'],
        ['bloques_plantilla_seccion_plantilla_id_posicion_unique', 'bloques_plantilla_seccion_id_posicion_bloque_unique'],
        ['definiciones_campo_bloque_plantilla_id_posicion_unique', 'definiciones_campo_bloque_id_posicion_campo_unique'],
        ['definiciones_campo_plantilla_id_clave_unique', 'definiciones_campo_plantilla_id_clave_campo_unique'],
        ['fuentes_academicas_activo_index', 'fuentes_academicas_activa_index'],
        ['fuentes_academicas_carrera_id_nombre_unique', 'fuentes_academicas_carrera_id_nombre_fuente_unique'],
    ];

    public function up(): void
    {
        foreach (self::RENAMES as [$table, $from, $to]) {
            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$from} TO {$to}");
        }

        foreach (self::INDEX_RENAMES as [$from, $to]) {
            DB::statement("ALTER INDEX {$from} RENAME TO {$to}");
        }

        $this->redefineEvidenceValidation('fuente_academica_activa');
    }

    public function down(): void
    {
        foreach (array_reverse(self::INDEX_RENAMES) as [$from, $to]) {
            DB::statement("ALTER INDEX {$to} RENAME TO {$from}");
        }

        foreach (array_reverse(self::RENAMES) as [$table, $from, $to]) {
            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$to} TO {$from}");
        }

        $this->redefineEvidenceValidation('activo');
    }

    private function redefineEvidenceValidation(string $activeColumn): void
    {
        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION validar_evidencia_ia() RETURNS trigger AS $$
            DECLARE
                carrera_fuente uuid;
                carrera_silabo uuid;
                fuente_activa boolean;
                convocatoria_silabo uuid;
                estado_ejecucion text;
            BEGIN
                SELECT {$activeColumn}, carrera_id INTO fuente_activa, carrera_fuente
                FROM fuentes_academicas WHERE id = NEW.fuente_academica_id;
                SELECT s.convocatoria_id, c.carrera_id, e.estado
                INTO convocatoria_silabo, carrera_silabo, estado_ejecucion
                FROM ejecuciones_ia e
                JOIN silabos s ON s.id = e.silabo_id
                JOIN convocatorias_carreras c ON c.id = s.convocatoria_id
                WHERE e.id = NEW.ejecucion_ia_id;

                IF carrera_fuente IS DISTINCT FROM carrera_silabo
                   OR fuente_activa IS DISTINCT FROM TRUE
                   OR estado_ejecucion IS DISTINCT FROM 'pendiente'
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
            SQL);
    }
};
