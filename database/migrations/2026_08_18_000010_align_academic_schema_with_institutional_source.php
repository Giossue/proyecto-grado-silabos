<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Alinea la estructura académica con la fuente institucional SIANET (PostgreSQL 10,
 * base `bdsianet`), verificada sobre el respaldo del 23 de junio de 2025.
 *
 * Cubre las brechas confirmadas contra datos reales, no contra el DDL:
 *  1. `periodo_lectivo.cod_carr` es NOT NULL: 1462 periodos, 49 nombres, 100 carreras.
 *  2. La jerarquía real es facultad -> escuela -> carrera.
 *  4. La asignatura tiene doble identidad: `cod_oculto` (entero, destino de las FK)
 *     y `cod_asig` (texto, p. ej. SFT-P-614).
 *  5. El ciclo vive en `detalles_malla.ciclo`, no en la asignatura.
 *  6. `malla` no tiene versión numérica, solo descripción y vigencia.
 *  7. Las horas vienen desglosadas en seis columnas.
 *  8. Campus y modalidad son texto libre que no respeta el catálogo `centro`.
 * 10. La identidad del docente es la cédula `ci_doc`.
 *
 * Las brechas 3 y 9 no requieren cambio estructural: la oferta académica se deriva de
 * `asignatura_docente` y los prerequisitos de `asignaturas.secuencia` en el mapper.
 */
return new class extends Migration
{
    public function up(): void
    {
        // --- Brecha 2: nivel `escuela` entre facultad y carrera ---------------------
        Schema::create('escuelas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('facultad_id')->constrained('facultades')->restrictOnDelete();
            $table->string('codigo_institucional', 80)->nullable()->unique();
            $table->string('nombre', 180);
            $table->boolean('activo')->default(true)->index();
            $table->timestampsTz();

            // Permite la clave ajena compuesta que impide reasignar una carrera a una
            // escuela de otra facultad.
            $table->unique(['id', 'facultad_id'], 'escuela_identidad_facultad_unica');
        });

        Schema::table('carreras', function (Blueprint $table) {
            $table->uuid('escuela_id')->nullable()->after('facultad_id');
            $table->index('escuela_id');
        });

        DB::statement(<<<'SQL'
            ALTER TABLE carreras ADD CONSTRAINT carreras_escuela_facultad_fk
                FOREIGN KEY (escuela_id, facultad_id)
                REFERENCES escuelas (id, facultad_id)
                ON UPDATE RESTRICT ON DELETE RESTRICT
            SQL);

        // --- Brecha 1: el periodo académico pertenece a una carrera -----------------
        Schema::table('periodos_academicos', function (Blueprint $table) {
            $table->foreignUuid('carrera_id')->nullable()->after('id')
                ->constrained('carreras')->restrictOnDelete();
            $table->string('codigo_institucional', 80)->nullable()->after('carrera_id');
            $table->unsignedSmallInteger('anio')->nullable()->after('fecha_fin');
        });

        // `codigo` deja de ser único global: un mismo nombre de periodo existe una vez
        // por carrera en la fuente institucional.
        DB::statement('ALTER TABLE periodos_academicos DROP CONSTRAINT IF EXISTS periodos_academicos_codigo_unique');
        DB::statement('DROP INDEX IF EXISTS periodos_academicos_codigo_unique');
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX periodos_codigo_global_unico
                ON periodos_academicos (codigo) WHERE carrera_id IS NULL
            SQL);
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX periodos_codigo_carrera_unico
                ON periodos_academicos (codigo, carrera_id) WHERE carrera_id IS NOT NULL
            SQL);
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX periodos_codigo_institucional_unico
                ON periodos_academicos (codigo_institucional) WHERE codigo_institucional IS NOT NULL
            SQL);

        // --- Brecha 6: la malla institucional no tiene versión numérica -------------
        Schema::table('versiones_malla', function (Blueprint $table) {
            $table->string('codigo_institucional', 80)->nullable()->after('codigo');
            $table->text('descripcion')->nullable()->after('codigo_institucional');
        });

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX versiones_malla_codigo_institucional_unico
                ON versiones_malla (codigo_institucional) WHERE codigo_institucional IS NOT NULL
            SQL);

        // --- Brechas 4, 5 y 7: identidad, ciclo y desglose de horas -----------------
        Schema::table('asignaturas', function (Blueprint $table) {
            $table->renameColumn('nivel', 'ciclo');
        });

        Schema::table('asignaturas', function (Blueprint $table) {
            $table->unsignedInteger('codigo_oculto_institucional')->nullable()->after('codigo_institucional');
            $table->decimal('horas_proyecto', 6, 2)->nullable()->after('horas_totales');
            $table->decimal('horas_ap', 6, 2)->nullable()->after('horas_proyecto');
            $table->decimal('horas_ac', 6, 2)->nullable()->after('horas_ap');
            $table->decimal('horas_pae', 6, 2)->nullable()->after('horas_ac');
            $table->decimal('horas_aa', 6, 2)->nullable()->after('horas_pae');
            $table->decimal('horas_paec', 6, 2)->nullable()->after('horas_aa');
        });

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX asignaturas_codigo_oculto_unico
                ON asignaturas (codigo_oculto_institucional) WHERE codigo_oculto_institucional IS NOT NULL
            SQL);

        DB::statement("COMMENT ON COLUMN asignaturas.codigo_oculto_institucional IS 'SIANET asignaturas.cod_oculto: entero al que apuntan todas las claves ajenas de la fuente'");
        DB::statement("COMMENT ON COLUMN asignaturas.codigo_institucional IS 'SIANET asignaturas.cod_asig: código visible, p. ej. SFT-P-614'");
        DB::statement("COMMENT ON COLUMN asignaturas.ciclo IS 'SIANET detalles_malla.ciclo: posición curricular de la materia'");
        DB::statement("COMMENT ON COLUMN asignaturas.horas_proyecto IS 'SIANET asignaturas.horas_proy'");
        DB::statement("COMMENT ON COLUMN asignaturas.horas_ap IS 'SIANET asignaturas.horas_ap; expansión de la sigla POR VALIDAR con la UEB'");
        DB::statement("COMMENT ON COLUMN asignaturas.horas_ac IS 'SIANET asignaturas.horas_ac; expansión de la sigla POR VALIDAR con la UEB'");
        DB::statement("COMMENT ON COLUMN asignaturas.horas_pae IS 'SIANET asignaturas.horas_pae; expansión de la sigla POR VALIDAR con la UEB'");
        DB::statement("COMMENT ON COLUMN asignaturas.horas_aa IS 'SIANET asignaturas.horas_aa; expansión de la sigla POR VALIDAR con la UEB'");
        DB::statement("COMMENT ON COLUMN asignaturas.horas_paec IS 'SIANET asignaturas.horas_paec; expansión de la sigla POR VALIDAR con la UEB'");

        // --- Brechas 3 y 10: trazabilidad de la asignación docente ------------------
        Schema::table('asignaciones_docente', function (Blueprint $table) {
            $table->string('codigo_institucional', 40)->nullable()->after('paralelo_id');
        });

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX asignaciones_docente_codigo_institucional_unico
                ON asignaciones_docente (codigo_institucional) WHERE codigo_institucional IS NOT NULL
            SQL);
        DB::statement("COMMENT ON COLUMN asignaciones_docente.codigo_institucional IS 'SIANET asignatura_docente.cod_asig_doc, con formato {cedula}-{secuencial}'");

        Schema::table('usuarios', function (Blueprint $table) {
            $table->string('documento_identidad', 20)->nullable()->after('email');
        });

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX usuarios_documento_identidad_unico
                ON usuarios (documento_identidad) WHERE documento_identidad IS NOT NULL
            SQL);
        DB::statement("COMMENT ON COLUMN usuarios.documento_identidad IS 'SIANET docente.ci_doc: cédula usada para reconciliar identidad institucional'");

        // --- Brecha 8: alias de texto libre hacia catálogos normalizados ------------
        // La fuente escribe MATRIZ, GUARANDA, SAN MIGUEL o LAS NAVES en texto libre y
        // su propio catálogo `centro` no cubre esos valores. El catálogo normalizado se
        // conserva y la conciliación ocurre aquí, de forma auditable.
        Schema::create('alias_institucionales', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('tipo_entidad', 60);
            $table->string('alias', 180);
            $table->uuid('entidad_id');
            $table->string('origen', 100)->default('sianet');
            $table->foreignUuid('registrado_por')->nullable()->constrained('usuarios')->restrictOnDelete();
            $table->timestampsTz();

            $table->unique(['tipo_entidad', 'alias'], 'alias_institucional_unico');
            $table->index(['tipo_entidad', 'entidad_id'], 'alias_institucional_entidad_idx');
        });

        DB::statement("ALTER TABLE alias_institucionales ADD CONSTRAINT alias_institucionales_tipo_check CHECK (tipo_entidad IN ('campus', 'modalidad'))");
        DB::statement('ALTER TABLE alias_institucionales ADD CONSTRAINT alias_institucionales_alias_check CHECK (char_length(btrim(alias)) > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('alias_institucionales');

        DB::statement('DROP INDEX IF EXISTS usuarios_documento_identidad_unico');
        Schema::table('usuarios', function (Blueprint $table) {
            $table->dropColumn('documento_identidad');
        });

        DB::statement('DROP INDEX IF EXISTS asignaciones_docente_codigo_institucional_unico');
        Schema::table('asignaciones_docente', function (Blueprint $table) {
            $table->dropColumn('codigo_institucional');
        });

        DB::statement('DROP INDEX IF EXISTS asignaturas_codigo_oculto_unico');
        Schema::table('asignaturas', function (Blueprint $table) {
            $table->dropColumn([
                'codigo_oculto_institucional',
                'horas_proyecto',
                'horas_ap',
                'horas_ac',
                'horas_pae',
                'horas_aa',
                'horas_paec',
            ]);
        });

        Schema::table('asignaturas', function (Blueprint $table) {
            $table->renameColumn('ciclo', 'nivel');
        });

        DB::statement('DROP INDEX IF EXISTS versiones_malla_codigo_institucional_unico');
        Schema::table('versiones_malla', function (Blueprint $table) {
            $table->dropColumn(['codigo_institucional', 'descripcion']);
        });

        DB::statement('DROP INDEX IF EXISTS periodos_codigo_institucional_unico');
        DB::statement('DROP INDEX IF EXISTS periodos_codigo_carrera_unico');
        DB::statement('DROP INDEX IF EXISTS periodos_codigo_global_unico');
        Schema::table('periodos_academicos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('carrera_id');
            $table->dropColumn(['codigo_institucional', 'anio']);
            $table->unique('codigo');
        });

        DB::statement('ALTER TABLE carreras DROP CONSTRAINT IF EXISTS carreras_escuela_facultad_fk');
        Schema::table('carreras', function (Blueprint $table) {
            $table->dropIndex(['escuela_id']);
            $table->dropColumn('escuela_id');
        });

        Schema::dropIfExists('escuelas');
    }
};
