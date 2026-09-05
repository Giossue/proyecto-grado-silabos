<?php

namespace Tests\Feature\Academic;

use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verifica el período institucional que conserva el producto.
 */
class InstitutionalSchemaAlignmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
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
