<?php

namespace Tests\Feature\Academic;

use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\School;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verifica las relaciones institucionales que conserva el producto.
 */
class InstitutionalSchemaAlignmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_una_carrera_no_puede_colgar_de_una_escuela_de_otra_facultad(): void
    {
        $facultad = Faculty::query()->firstOrFail();
        $otraFacultad = Faculty::query()->create([
            'codigo_institucional' => 'FAC-OTRA',
            'nombre' => 'Otra facultad',
            'activo' => true,
        ]);
        $escuela = School::query()->create([
            'facultad_id' => $otraFacultad->id,
            'nombre' => 'Escuela de otra facultad',
            'activo' => true,
        ]);

        $this->expectException(QueryException::class);
        Career::query()->create([
            'facultad_id' => $facultad->id,
            'escuela_id' => $escuela->id,
            'codigo_institucional' => 'CARR-INCOHERENTE',
            'nombre' => 'Carrera incoherente',
            'activo' => true,
        ]);
    }

    public function test_una_escuela_coherente_si_enlaza_carrera_y_facultad(): void
    {
        $facultad = Faculty::query()->firstOrFail();
        $escuela = School::query()->create([
            'facultad_id' => $facultad->id,
            'nombre' => 'Sistemas',
            'activo' => true,
        ]);
        $carrera = Career::query()->create([
            'facultad_id' => $facultad->id,
            'escuela_id' => $escuela->id,
            'codigo_institucional' => 'SW-1',
            'nombre' => 'Software',
            'activo' => true,
        ]);

        $this->assertSame($escuela->id, $carrera->fresh()->escuela_id);
        $this->assertSame($facultad->id, $carrera->school->faculty->id);
    }

    public function test_el_codigo_de_periodo_es_unico_para_toda_la_universidad(): void
    {
        $atributos = [
            'codigo' => 'MAYO-2022-SEPTIEMBRE-2022',
            'nombre' => 'Mayo 2022 - Septiembre 2022',
            'fecha_inicio' => '2022-05-02',
            'fecha_fin' => '2022-09-30',
            'activo' => true,
        ];
        AcademicPeriod::query()->create($atributos);

        $this->assertSame(1, AcademicPeriod::query()
            ->where('codigo', 'MAYO-2022-SEPTIEMBRE-2022')->count());

        $this->expectException(QueryException::class);
        AcademicPeriod::query()->create($atributos);
    }
}
