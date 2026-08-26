<?php

namespace Tests\Feature\Academic;

use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\School;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Integrations\Application\SianetAcademicRecordMapper;
use App\Modules\Integrations\Application\SianetIdentityReconciler;
use App\Modules\Integrations\Domain\Data\InstitutionalRecord;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Verifica la alineación del esquema con la fuente institucional SIANET.
 * Las cotas de cada caso provienen del respaldo del 23 de junio de 2025.
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
            'codigo_institucional' => 'ES-OTRA',
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
            'codigo_institucional' => 'ES-1',
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

    public function test_el_mismo_codigo_de_periodo_se_repite_entre_carreras_pero_no_dentro_de_una(): void
    {
        // En la fuente hay 1462 periodos con solo 49 nombres distintos porque
        // `periodo_lectivo.cod_carr` es obligatorio.
        $primera = Career::query()->firstOrFail();
        $segunda = Career::query()->create([
            'facultad_id' => $primera->facultad_id,
            'codigo_institucional' => 'CARR-SEGUNDA',
            'nombre' => 'Segunda carrera',
            'activo' => true,
        ]);

        $atributos = [
            'codigo' => 'MAYO-2022-SEPTIEMBRE-2022',
            'nombre' => 'Mayo 2022 - Septiembre 2022',
            'fecha_inicio' => '2022-05-02',
            'fecha_fin' => '2022-09-30',
            'activo' => true,
        ];
        AcademicPeriod::query()->create($atributos + ['carrera_id' => $primera->id]);
        AcademicPeriod::query()->create($atributos + ['carrera_id' => $segunda->id]);

        $this->assertSame(2, AcademicPeriod::query()
            ->where('codigo', 'MAYO-2022-SEPTIEMBRE-2022')->count());

        $this->expectException(QueryException::class);
        AcademicPeriod::query()->create($atributos + ['carrera_id' => $primera->id]);
    }

    public function test_la_identidad_oculta_de_una_asignatura_es_unica(): void
    {
        $malla = CurriculumVersion::query()->firstOrFail();
        Subject::query()->create([
            'version_malla_id' => $malla->id,
            'codigo_institucional' => 'SW-900',
            'codigo_oculto_institucional' => 9900,
            'nombre' => 'Materia con identidad institucional',
            'ciclo' => 3,
            'creditos' => 3,
            'activo' => true,
        ]);

        $this->expectException(QueryException::class);
        Subject::query()->create([
            'version_malla_id' => $malla->id,
            'codigo_institucional' => 'SW-901',
            'codigo_oculto_institucional' => 9900,
            'nombre' => 'Materia que repite la identidad',
            'ciclo' => 4,
            'creditos' => 3,
            'activo' => true,
        ]);
    }

    public function test_el_mapper_acepta_parentesis_y_ciclo_ausente(): void
    {
        // 332 de 4939 códigos de la fuente traen paréntesis y 21 asignaturas no
        // tienen fila en `detalles_malla`, así que llegan sin ciclo.
        $resultado = (new SianetAcademicRecordMapper)->map(
            new InstitutionalRecord(1, 'ref-parentesis', 'subject', [
                'career_code' => 'SW-1',
                'curriculum_code' => 'MALLA-63',
                'institutional_code' => 'PLCE(MF)H-UB-207',
                'hidden_code' => 2874,
                'name' => '  Administración  ',
                'cycle' => null,
                'credits' => 3,
                'active' => true,
            ]),
        );

        $this->assertTrue($resultado->valid);
        $this->assertSame('mapped', $resultado->reasonCode);
        $this->assertSame('PLCE(MF)H-UB-207', $resultado->normalized['institutional_code']);
        $this->assertSame('Administración', $resultado->normalized['name']);
        $this->assertNull($resultado->normalized['cycle']);
    }

    public function test_el_mapper_rechaza_un_registro_sin_identidad_institucional(): void
    {
        $resultado = (new SianetAcademicRecordMapper)->map(
            new InstitutionalRecord(1, 'ref-sin-identidad', 'subject', [
                'career_code' => 'SW-1',
                'curriculum_code' => 'MALLA-63',
                'institutional_code' => 'SFT-P-614',
                'hidden_code' => 0,
                'name' => 'Administración',
                'cycle' => 6,
                'credits' => 3,
                'active' => true,
            ]),
        );

        $this->assertFalse($resultado->valid);
        $this->assertSame('invalid_hidden_code', $resultado->reasonCode);
    }

    public function test_el_reconciliador_resuelve_por_identidad_oculta(): void
    {
        $malla = CurriculumVersion::query()->firstOrFail();
        $asignatura = Subject::query()->create([
            'version_malla_id' => $malla->id,
            'codigo_institucional' => 'SW-950',
            'codigo_oculto_institucional' => 9950,
            'nombre' => 'Materia conciliable',
            'ciclo' => 5,
            'creditos' => 4,
            'activo' => true,
        ]);
        $reconciliador = new SianetIdentityReconciler;
        $base = [
            'career_code' => 'SW-1',
            'curriculum_code' => 'MALLA-63',
            'institutional_code' => 'SW-950',
            'name' => 'Materia conciliable',
            'cycle' => 5,
            'credits' => 4.0,
            'active' => true,
        ];

        $ausente = $reconciliador->propose('subject', $base + ['hidden_code' => 9999]);
        $this->assertSame('new', $ausente->result);
        $this->assertSame('create', $ausente->proposedAction);
        $this->assertSame('institutional_identity_absent', $ausente->reasonCode);

        $igual = $reconciliador->propose('subject', $base + ['hidden_code' => 9950]);
        $this->assertSame('unchanged', $igual->result);
        $this->assertSame('none', $igual->proposedAction);
        $this->assertSame($asignatura->id, $igual->candidateId);

        $distinto = $reconciliador->propose('subject', array_merge($base, [
            'hidden_code' => 9950,
            'name' => 'Materia conciliable renombrada',
        ]));
        $this->assertSame('change', $distinto->result);
        $this->assertSame('update', $distinto->proposedAction);
        $this->assertSame('institutional_attributes_differ', $distinto->reasonCode);
    }
}
