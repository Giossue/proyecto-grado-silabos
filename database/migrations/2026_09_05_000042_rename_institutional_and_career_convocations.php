<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE procesos_silabos RENAME TO convocatorias_universidad');
        DB::statement('ALTER TABLE convocatorias RENAME TO convocatorias_carreras');
        DB::statement('DROP TRIGGER IF EXISTS convocatorias_periodo_del_proceso ON convocatorias_carreras');
        DB::statement('DROP TRIGGER IF EXISTS procesos_periodo_sin_convocatorias ON convocatorias_universidad');
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION validar_periodo_convocatoria_proceso() RETURNS trigger AS $$
            BEGIN
                IF NEW.periodo_academico_id IS DISTINCT FROM (SELECT periodo_academico_id FROM convocatorias_universidad WHERE id = NEW.proceso_id) THEN RAISE EXCEPTION 'La convocatoria de carrera debe usar el período de la convocatoria universitaria.'; END IF;
                RETURN NEW;
            END; $$ LANGUAGE plpgsql;
            CREATE TRIGGER convocatorias_carreras_periodo_universidad BEFORE INSERT OR UPDATE OF proceso_id, periodo_academico_id ON convocatorias_carreras FOR EACH ROW EXECUTE FUNCTION validar_periodo_convocatoria_proceso();
            CREATE OR REPLACE FUNCTION impedir_cambio_periodo_proceso_con_convocatorias() RETURNS trigger AS $$
            BEGIN
                IF NEW.periodo_academico_id IS DISTINCT FROM OLD.periodo_academico_id AND EXISTS (SELECT 1 FROM convocatorias_carreras WHERE proceso_id = OLD.id) THEN RAISE EXCEPTION 'No se puede cambiar el período de una convocatoria universitaria con convocatorias de carrera.'; END IF;
                RETURN NEW;
            END; $$ LANGUAGE plpgsql;
            CREATE TRIGGER convocatorias_universidad_periodo_protegido BEFORE UPDATE OF periodo_academico_id ON convocatorias_universidad FOR EACH ROW EXECUTE FUNCTION impedir_cambio_periodo_proceso_con_convocatorias();
            SQL);
    }

    public function down(): void
    {
        throw new RuntimeException('I-52 no admite reversión automática.');
    }
};
