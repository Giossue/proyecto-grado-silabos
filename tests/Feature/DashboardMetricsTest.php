<?php

namespace Tests\Feature;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class DashboardMetricsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_cada_rol_recibe_sus_propios_indicadores(): void
    {
        $esperado = [
            'admin@silabos.test' => ['users', 'careers', 'templates', 'failed_jobs'],
            'coordinador@silabos.test' => ['open_convocations', 'in_review', 'correction_requested', 'approved'],
            'docente@silabos.test' => ['assigned', 'draft', 'in_review', 'correction_requested'],
        ];

        foreach ($esperado as $correo => $claves) {
            $user = User::query()->where('email', $correo)->firstOrFail();

            $this->actingAs($user)
                ->followingRedirects()
                ->get(route('dashboard'))
                ->assertOk()
                ->assertInertia(fn (Assert $page) => $page
                    ->component('Dashboard')
                    ->has('metrics', 4)
                    ->where('metrics.0.key', $claves[0])
                    ->where('metrics.3.key', $claves[3]));
        }
    }

    public function test_el_coordinador_no_cuenta_convocatorias_de_otra_carrera(): void
    {
        $coordinator = User::query()->where('email', 'coordinador@silabos.test')->firstOrFail();
        $propia = $coordinator->roleAssignments()->firstOrFail()->carrera_id;

        $this->abrirConvocatoria($propia, 'Convocatoria propia');
        $this->abrirConvocatoria($this->otraCarrera()->id, 'Convocatoria ajena');

        $this->actingAs($coordinator)
            ->followingRedirects()
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('metrics.0.key', 'open_convocations')
                ->where('metrics.0.value', 1));
    }

    public function test_el_docente_solo_cuenta_los_silabos_en_los_que_colabora(): void
    {
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $career = $teacher->roleAssignments()->firstOrFail()->carrera_id;
        $convocation = $this->abrirConvocatoria($career, 'Convocatoria con expedientes');

        $propio = $this->crearSilabo($convocation);
        $this->crearSilabo($convocation); // de otra persona: nunca se le cuenta

        SyllabusCollaborator::query()->create([
            'silabo_id' => $propio->id,
            'usuario_id' => $teacher->id,
            'asignacion_docente_id' => TeacherAssignment::query()->firstOrFail()->id,
        ]);

        $this->actingAs($teacher)
            ->followingRedirects()
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('metrics.0.key', 'assigned')
                ->where('metrics.0.value', 1));
    }

    private function abrirConvocatoria(?string $careerId, string $nombre): Convocation
    {
        return Convocation::query()->create([
            'carrera_id' => $careerId,
            'periodo_academico_id' => AcademicPeriod::query()->firstOrFail()->id,
            'version_plantilla_id' => $this->plantillaPublicada()->id,
            'nombre' => $nombre,
            'estado' => 'open',
            'modo_agrupacion' => 'per_offering',
            'creado_por' => User::query()->where('email', 'coordinador@silabos.test')->firstOrFail()->id,
        ]);
    }

    private function crearSilabo(Convocation $convocation): Syllabus
    {
        $subject = Subject::query()->firstOrFail();

        return Syllabus::query()->create([
            'convocatoria_id' => $convocation->id,
            'asignatura_id' => $subject->id,
            'version_malla_id' => $subject->version_malla_id,
            'version_plantilla_id' => $convocation->version_plantilla_id,
            'estado' => 'draft',
        ]);
    }

    private function plantillaPublicada(): TemplateVersion
    {
        return TemplateVersion::query()->firstOr(function (): TemplateVersion {
            $template = SyllabusTemplate::query()->create([
                'nombre' => 'Plantilla para indicadores',
                'activo' => true,
            ]);

            return TemplateVersion::query()->create([
                'plantilla_id' => $template->id,
                'numero_version' => 1,
                'estado' => 'published',
            ]);
        });
    }

    private function otraCarrera(): Career
    {
        return Career::query()->create([
            'facultad_id' => Faculty::query()->firstOrFail()->id,
            'codigo_institucional' => 'CARR-AJENA',
            'nombre' => 'Carrera ajena',
            'activo' => true,
        ]);
    }
}
