<?php

namespace Tests\Feature;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesSyllabusProcess;
use Tests\TestCase;

class DashboardMetricsTest extends TestCase
{
    use CreatesSyllabusProcess;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_cada_rol_recibe_sus_propios_indicadores(): void
    {
        $esperado = [
            'admin@silabos.test' => ['progress', 'days_left', 'careers_without_convocation', 'not_started'],
            'coordinador@silabos.test' => ['progress', 'days_left', 'in_review', 'not_started'],
            'docente@silabos.test' => ['pending', 'days_left', 'completion', 'correction_requested'],
        ];

        foreach ($esperado as $correo => $claves) {
            $user = User::query()->where('correo_electronico', $correo)->firstOrFail();
            $context = $user->roleAssignments()->firstOrFail();

            $this->actingAs($user)
                ->withSession(['active_role_assignment_id' => $context->id])
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

    public function test_cada_rol_recibe_su_puesta_en_marcha_en_orden(): void
    {
        $esperado = [
            // El docente no tiene sílabos hasta que Coordinación abra la convocatoria.
            'admin@silabos.test' => ['faculties', 'process', 8, true],
            'coordinador@silabos.test' => ['curriculum', 'convocation', 6, true],
            'docente@silabos.test' => ['assigned', 'submitted', 3, false],
        ];
        foreach ($esperado as $correo => [$primero, $ultimo, $total, $primeroHecho]) {
            $user = User::query()->where('correo_electronico', $correo)->firstOrFail();
            $context = $user->roleAssignments()->firstOrFail();
            $this->actingAs($user)
                ->withSession(['active_role_assignment_id' => $context->id])
                ->followingRedirects()
                ->get(route('dashboard'))
                ->assertOk()
                ->assertInertia(fn (Assert $page) => $page
                    ->component('Dashboard')
                    ->where('setup.total', $total)
                    ->has('setup.steps', $total)
                    ->where('setup.steps.0.key', $primero)
                    ->where('setup.steps.'.($total - 1).'.key', $ultimo)
                    ->where('setup.steps.0.done', $primeroHecho)
                    ->where('setupProgress.total', $total));
        }

        // Con la base sembrada, al administrador le faltan la plantilla y el proceso.
        $admin = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->actingAs($admin)
            ->withSession(['active_role_assignment_id' => $admin->roleAssignments()->firstOrFail()->id])
            ->followingRedirects()
            ->get(route('dashboard'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('setup.steps.6.done', false)
                ->where('setup.steps.7.done', false));
    }

    public function test_el_coordinador_no_cuenta_convocatorias_de_otra_carrera(): void
    {
        $coordinator = User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
        $propia = $coordinator->roleAssignments()->firstOrFail()->carrera_id;

        $this->abrirConvocatoria($propia);
        $this->abrirConvocatoria($this->otraCarrera()->id);

        $this->actingAs($coordinator)
            ->withSession([
                'active_role_assignment_id' => $coordinator->roleAssignments()->firstOrFail()->id,
            ])
            ->followingRedirects()
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('metrics.0.key', 'progress')
                ->where('metrics.0.value', 0)
                ->where('metrics.0.hint', '0 de 0 sílabos aprobados')
                ->where('metrics.1.suffix', 'días'));
    }

    public function test_el_docente_solo_cuenta_los_silabos_en_los_que_colabora(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $career = $teacher->roleAssignments()->firstOrFail()->carrera_id;
        $convocation = $this->abrirConvocatoria($career);

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
                ->where('metrics.0.key', 'pending')
                ->where('metrics.0.value', 1)
                ->where('metrics.2.key', 'completion')
                ->where('metrics.2.suffix', '%'));
    }

    private function abrirConvocatoria(?string $careerId): Convocation
    {
        $template = $this->plantillaPublicada();

        return Convocation::query()->create([
            'carrera_id' => $careerId,
            'proceso_id' => $this->openSyllabusProcess($template->id)->id,
            'estado' => 'abierta',
        ]);
    }

    private function crearSilabo(Convocation $convocation): Syllabus
    {
        $subject = Subject::query()->firstOrFail();

        return Syllabus::query()->create([
            'convocatoria_id' => $convocation->id,
            'asignatura_id' => $subject->id,
            'malla_id' => $subject->malla_id,
            'plantilla_id' => $convocation->process->plantilla_id,
            'estado' => 'borrador',
        ]);
    }

    private function plantillaPublicada(): SyllabusTemplate
    {
        return SyllabusTemplate::query()->firstOr(fn (): SyllabusTemplate => SyllabusTemplate::query()->create([
            'nombre' => 'Plantilla para indicadores',
            'activo' => true,
            'es_institucional' => true,
        ]));
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
