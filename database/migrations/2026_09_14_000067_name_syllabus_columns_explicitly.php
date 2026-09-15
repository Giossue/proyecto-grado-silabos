<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** @var list<array{string, string, string}> */
    private const RENAMES = [
        ['convocatorias_universidad', 'estado', 'estado_convocatoria_universidad'],
        ['convocatorias_carreras', 'estado', 'estado_convocatoria_carrera'],
        ['fechas_limite_convocatoria', 'etapa', 'etapa_fecha_limite_convocatoria'],
        ['silabos', 'estado', 'estado_silabo'],
        ['silabos', 'contexto_academico', 'contexto_academico_silabo'],
        ['valores_campo', 'valor', 'valor_campo'],
        ['valores_campo', 'origen', 'origen_valor_campo'],
        ['filas_repetibles', 'datos', 'datos_fila_repetible'],
        ['filas_repetibles', 'posicion', 'posicion_fila_repetible'],
        ['ejecuciones_validacion', 'estado', 'estado_ejecucion_validacion'],
        ['ejecuciones_validacion', 'advertencias', 'cantidad_advertencias_validacion'],
        ['resultados_validacion', 'codigo', 'codigo_resultado_validacion'],
        ['resultados_validacion', 'severidad', 'severidad_resultado_validacion'],
        ['resultados_validacion', 'mensaje', 'mensaje_resultado_validacion'],
        ['revisiones_silabo', 'fotografia', 'fotografia_revision_silabo'],
        ['observaciones_revision', 'contenido', 'contenido_observacion_revision'],
        ['observaciones_revision', 'estado', 'estado_observacion_revision'],
        ['solicitudes_correccion', 'justificacion', 'justificacion_solicitud_correccion'],
        ['respuestas_observacion', 'contenido', 'contenido_respuesta_observacion'],
        ['transiciones_silabo', 'accion', 'accion_transicion_silabo'],
        ['transiciones_silabo', 'metadatos', 'metadatos_transicion_silabo'],
    ];

    public function up(): void
    {
        foreach (self::RENAMES as [$table, $from, $to]) {
            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$from} TO {$to}");
        }

        $this->redefineObservationContentProtection('contenido_observacion_revision');
    }

    public function down(): void
    {
        foreach (array_reverse(self::RENAMES) as [$table, $from, $to]) {
            DB::statement("ALTER TABLE {$table} RENAME COLUMN {$to} TO {$from}");
        }

        $this->redefineObservationContentProtection('contenido');
    }

    private function redefineObservationContentProtection(string $contentColumn): void
    {
        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION proteger_contenido_observacion() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE'
                   OR NEW.revision_silabo_id IS DISTINCT FROM OLD.revision_silabo_id
                   OR NEW.clave_seccion IS DISTINCT FROM OLD.clave_seccion
                   OR NEW.clave_campo IS DISTINCT FROM OLD.clave_campo
                   OR NEW.{$contentColumn} IS DISTINCT FROM OLD.{$contentColumn}
                   OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
                   OR NEW.observado_en IS DISTINCT FROM OLD.observado_en THEN
                    RAISE EXCEPTION 'El contenido de la observación es inmutable' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            SQL);
    }
};
