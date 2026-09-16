<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('carreras', function (Blueprint $table): void {
            $table->string('codigo_malla')->nullable();
            $table->smallInteger('cantidad_ciclos_malla')->nullable();
        });

        DB::statement(<<<'SQL'
            UPDATE carreras AS carrera
            SET codigo_malla = malla.codigo_malla,
                cantidad_ciclos_malla = malla.cantidad_ciclos_malla
            FROM mallas AS malla
            WHERE malla.carrera_id = carrera.id
        SQL);

        if (DB::table('carreras')->whereNull('codigo_malla')->exists()
            || DB::table('carreras')->whereNull('cantidad_ciclos_malla')->exists()) {
            throw new RuntimeException('No se puede retirar mallas: cada carrera debe conservar su código y ciclos.');
        }

        DB::statement('ALTER TABLE carreras ALTER COLUMN codigo_malla SET NOT NULL');
        DB::statement('ALTER TABLE carreras ALTER COLUMN cantidad_ciclos_malla SET NOT NULL');
        DB::statement('ALTER TABLE carreras ADD CONSTRAINT carreras_cantidad_ciclos_malla_check CHECK (cantidad_ciclos_malla BETWEEN 1 AND 30)');

        Schema::table('asignaturas', function (Blueprint $table): void {
            $table->foreignUuid('carrera_id')->nullable()->constrained('carreras')->restrictOnDelete();
        });
        DB::statement(<<<'SQL'
            UPDATE asignaturas AS asignatura
            SET carrera_id = malla.carrera_id
            FROM mallas AS malla
            WHERE malla.id = asignatura.malla_id
        SQL);
        DB::statement('ALTER TABLE asignaturas ALTER COLUMN carrera_id SET NOT NULL');
        DB::statement('ALTER TABLE asignaturas DROP CONSTRAINT asignaturas_malla_id_codigo_asignatura_unique');
        DB::statement('ALTER TABLE asignaturas DROP CONSTRAINT asignaturas_malla_id_foreign');
        DB::statement('ALTER TABLE asignaturas ADD CONSTRAINT asignaturas_carrera_id_codigo_asignatura_unique UNIQUE (carrera_id, codigo_asignatura)');
        Schema::table('asignaturas', function (Blueprint $table): void {
            $table->dropColumn('malla_id');
        });

        Schema::table('silabos', function (Blueprint $table): void {
            $table->foreignUuid('carrera_id')->nullable()->constrained('carreras')->restrictOnDelete();
        });
        DB::statement(<<<'SQL'
            UPDATE silabos AS silabo
            SET carrera_id = malla.carrera_id
            FROM mallas AS malla
            WHERE malla.id = silabo.malla_id
        SQL);
        DB::statement('ALTER TABLE silabos ALTER COLUMN carrera_id SET NOT NULL');
        DB::statement('ALTER TABLE silabos DROP CONSTRAINT silabos_malla_id_foreign');
        Schema::table('silabos', function (Blueprint $table): void {
            $table->dropColumn('malla_id');
        });

        Schema::drop('mallas');
    }

    public function down(): void
    {
        throw new LogicException('I-82 no revierte la eliminación de la entidad mallas.');
    }
};
