<?php

namespace Tests\Feature\Syllabus;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * I-31: el calendario académico oficial obliga a toda la universidad. Administración abre
 * el proceso; Coordinación convoca a su carrera dentro de él; la pausa —institucional o
 * de carrera— es lo que permite corregir plantilla, malla y fuentes sin que el trabajo
 * docente siga avanzando sobre una base que está cambiando.
 */
class SyllabusProcessTest extends TestCase
{
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    private User $coordinator;

    private RoleAssignment $coordinatorContext;

    private User $teacher;

    private RoleAssignment $teacherContext;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);

        $this->administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
        $this->coordinatorContext = $this->coordinator->roleAssignments()->firstOrFail();
        $this->teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $this->teacherContext = $this->teacher->roleAssignments()->firstOrFail();
    }

    public function test_only_administration_prepares_the_institutional_process(): void
    {
        $template = $this->publishedTemplate();

        $this->actingAsCoordinator()->post(route('admin.processes.store'), $this->processPayload($template))
            ->assertForbidden();
        $this->actingAsCoordinator()->get(route('admin.processes.index'))->assertForbidden();

        $this->actingAsAdministrator()->post(route('admin.processes.store'), $this->processPayload($template))
            ->assertRedirect()
            ->assertSessionHas('success');

        $process = SyllabusProcess::query()->firstOrFail();
        $this->assertSame('preparacion', $process->estado);
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'proceso_silabos.creado', 'recurso_id' => $process->id]);

        $this->actingAsAdministrator()->get(route('admin.processes.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Processes/Index')
                ->has('processes', 1)
                ->where('processes.0.state', 'preparacion'));
    }

    public function test_only_one_process_can_be_in_progress(): void
    {
        $template = $this->publishedTemplate();
        $first = $this->preparedProcess($template, 'Primero');
        $second = $this->preparedProcess($template, 'Segundo');

        $this->transition($first, 'abrir')->assertRedirect()->assertSessionHas('success');
        $this->assertSame('abierto', $first->fresh()->estado);

        $this->transition($second, 'abrir')->assertSessionHasErrors('process');
        $this->assertSame('preparacion', $second->fresh()->estado);

        // En pausa sigue ocupando el lugar: pausar no es cerrar.
        $this->transition($first, 'pausar', 'Corrección de la sección de evaluación.')->assertRedirect();
        $this->transition($second, 'abrir')->assertSessionHasErrors('process');

        $this->transition($first, 'cerrar')->assertRedirect();
        $this->transition($second, 'abrir')->assertRedirect()->assertSessionHas('success');
    }

    public function test_pausing_requires_a_written_reason_and_is_audited(): void
    {
        $process = $this->openProcess();

        $this->transition($process, 'pausar', null)->assertSessionHasErrors('reason');
        $this->transition($process, 'pausar', 'Corto')->assertSessionHasErrors('reason');
        $this->transition($process, 'pausar', 'Ajuste de la plantilla tras la observación del vicerrectorado.')
            ->assertRedirect();

        $this->assertSame('pausado', $process->fresh()->estado);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'proceso_silabos.pausado',
            'recurso_id' => $process->id,
        ]);
    }

    public function test_convocation_inherits_template_and_dates_and_only_opens_with_an_open_process(): void
    {
        $template = $this->publishedTemplate();
        $process = $this->preparedProcess($template, 'Elaboración 2026-2027');
        $source = $this->coordinatorSource();

        $this->actingAsCoordinator()->post(route('convocations.store'), [
            'nombre' => 'Convocatoria de Software',
            'process_id' => $process->id,
            'period_id' => CourseOffering::query()->firstOrFail()->periodo_academico_id,
            'grouping_mode' => 'por_oferta',
            'source_ids' => [$source->id],
        ])->assertRedirect();

        $convocation = Convocation::query()->firstOrFail();
        $this->assertSame($process->id, $convocation->proceso_id);
        $this->assertSame($template->id, $convocation->version_plantilla_id);
        $this->assertDatabaseHas('fechas_limite_convocatoria', [
            'convocatoria_id' => $convocation->id,
            'etapa' => 'inicio',
            'vence_en' => $process->inicia_en,
        ]);
        $this->assertDatabaseHas('fechas_limite_convocatoria', [
            'convocatoria_id' => $convocation->id,
            'etapa' => 'borrador',
            'vence_en' => $process->entrega_en,
        ]);

        // El proceso todavía se prepara: la carrera espera al calendario institucional.
        $this->actingAsCoordinator()->post(route('convocations.open', $convocation))
            ->assertSessionHasErrors('convocation');
        $this->assertSame('preparacion', $convocation->fresh()->estado);

        $this->transition($process, 'abrir')->assertRedirect();
        $this->actingAsCoordinator()->post(route('convocations.open', $convocation))->assertRedirect();
        $this->assertSame('abierta', $convocation->fresh()->estado);
        $this->assertDatabaseCount('silabos', 1);
    }

    public function test_an_open_process_freezes_the_template_until_it_is_paused(): void
    {
        $process = $this->openProcess();
        $version = $process->templateVersion;

        $this->actingAsAdministrator()->post(route('admin.templates.clone', $version))
            ->assertSessionHasErrors('process');
        $this->assertSame(1, TemplateVersion::query()->count());

        $this->actingAsAdministrator()->get(route('admin.templates.show', $version))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->whereNot('processLock', null));

        $this->transition($process, 'pausar', 'Hay que corregir el bloque de bibliografía.')->assertRedirect();

        $this->actingAsAdministrator()->post(route('admin.templates.clone', $version))->assertRedirect();
        $this->assertSame(2, TemplateVersion::query()->count());
        $this->actingAsAdministrator()->get(route('admin.templates.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('processLock', null));
    }

    public function test_a_running_convocation_freezes_curriculum_and_sources_of_its_career_only(): void
    {
        $convocation = $this->openedConvocation();
        $curriculum = CurriculumVersion::query()->current()->firstOrFail();
        $source = AcademicSource::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', ['entity' => 'malla', 'record' => $curriculum->id]), [
                'code' => 'MALLA-BLOQUEADA',
            ])
            ->assertSessionHasErrors('process');
        $this->assertSame('MALLA-SW-2024', $curriculum->fresh()->codigo);

        $this->actingAsCoordinator()
            ->patch(route('sources.update', $source), [
                'nombre' => 'Fuente renombrada',
                'description' => null,
                'internal_notes' => null,
            ])
            ->assertSessionHasErrors('process');
        $this->assertNotSame('Fuente renombrada', $source->fresh()->nombre);

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.show', $curriculum))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('curriculum.editable', false)
                ->whereNot('curriculum.lock_reason', null));

        // Pausar la convocatoria de la carrera libera su malla y sus fuentes.
        $this->actingAsCoordinator()
            ->post(route('convocations.transition', [$convocation, 'pausar']), [
                'reason' => 'Corrección de las horas de dos materias antes de continuar.',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');
        $this->assertSame('pausada', $convocation->fresh()->estado);

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', ['entity' => 'malla', 'record' => $curriculum->id]), [
                'code' => 'MALLA-CORREGIDA',
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertSame('MALLA-CORREGIDA', $curriculum->fresh()->codigo);

        $this->actingAsCoordinator()
            ->patch(route('sources.update', $source), [
                'nombre' => 'Fuente renombrada',
                'description' => null,
                'internal_notes' => null,
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $this->actingAsCoordinator()
            ->post(route('convocations.transition', [$convocation, 'reanudar']))
            ->assertRedirect();
        $this->assertSame('abierta', $convocation->fresh()->estado);
    }

    public function test_teachers_stop_working_while_the_career_or_the_institution_is_paused(): void
    {
        $convocation = $this->openedConvocation();
        $syllabus = Syllabus::query()->firstOrFail();

        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus))->assertRedirect();
        $this->assertSame('borrador', $syllabus->fresh()->estado);

        $this->actingAsCoordinator()
            ->post(route('convocations.transition', [$convocation, 'pausar']), [
                'reason' => 'Corrección de la malla antes de seguir elaborando.',
            ])
            ->assertRedirect();
        $this->actingAsTeacher()->get(route('syllabi.edit', $syllabus))->assertForbidden();

        $this->actingAsCoordinator()->post(route('convocations.transition', [$convocation, 'reanudar']))->assertRedirect();
        $this->actingAsTeacher()->get(route('syllabi.edit', $syllabus))->assertOk();

        // La pausa institucional detiene también a una convocatoria que sigue abierta.
        $process = $convocation->process()->firstOrFail();
        $this->transition($process, 'pausar', 'Ajuste institucional de la plantilla.')->assertRedirect();
        $this->assertSame('abierta', $convocation->fresh()->estado);
        $this->actingAsTeacher()->get(route('syllabi.edit', $syllabus))->assertForbidden();

        // Y mientras dure, la carrera no puede reanudar por su cuenta.
        $this->actingAsCoordinator()
            ->post(route('convocations.transition', [$convocation, 'pausar']), ['reason' => 'Pausa propia mientras tanto.'])
            ->assertRedirect();
        $this->actingAsCoordinator()
            ->post(route('convocations.transition', [$convocation, 'reanudar']))
            ->assertSessionHasErrors('convocation');

        $this->transition($process, 'reanudar')->assertRedirect();
        $this->actingAsCoordinator()->post(route('convocations.transition', [$convocation, 'reanudar']))->assertRedirect();
        $this->actingAsTeacher()->get(route('syllabi.edit', $syllabus))->assertOk();
    }

    public function test_process_configuration_changes_only_in_preparation_or_pause(): void
    {
        $process = $this->openProcess();
        $payload = [...$this->processPayload($process->templateVersion), 'nombre' => 'Renombrado'];

        $this->actingAsAdministrator()->patch(route('admin.processes.update', $process), $payload)
            ->assertForbidden();

        $this->transition($process, 'pausar', 'Se corrige el nombre y la fecha de entrega.')->assertRedirect();
        $this->actingAsAdministrator()->patch(route('admin.processes.update', $process), $payload)
            ->assertRedirect()
            ->assertSessionHas('success');
        $this->assertSame('Renombrado', $process->fresh()->nombre);
    }

    /** @return array{nombre: string, template_version_id: string, starts_at: string, due_at: string} */
    private function processPayload(TemplateVersion $template): array
    {
        return [
            'nombre' => 'Elaboración de sílabos 2026-2027',
            'template_version_id' => $template->id,
            'starts_at' => now()->subDay()->toIso8601String(),
            'due_at' => now()->addMonth()->toIso8601String(),
        ];
    }

    private function preparedProcess(TemplateVersion $template, string $name): SyllabusProcess
    {
        $this->actingAsAdministrator()
            ->post(route('admin.processes.store'), [...$this->processPayload($template), 'nombre' => $name])
            ->assertRedirect();

        return SyllabusProcess::query()->where('nombre', $name)->firstOrFail();
    }

    private function openProcess(): SyllabusProcess
    {
        $process = $this->preparedProcess($this->publishedTemplate(), 'Proceso abierto');
        $this->transition($process, 'abrir')->assertRedirect();

        return $process->fresh();
    }

    private function openedConvocation(): Convocation
    {
        $process = $this->openProcess();
        $source = $this->coordinatorSource();

        $this->actingAsCoordinator()->post(route('convocations.store'), [
            'nombre' => 'Convocatoria en curso',
            'process_id' => $process->id,
            'period_id' => CourseOffering::query()->firstOrFail()->periodo_academico_id,
            'grouping_mode' => 'por_oferta',
            'source_ids' => [$source->id],
        ])->assertRedirect();
        $convocation = Convocation::query()->where('nombre', 'Convocatoria en curso')->firstOrFail();
        $this->actingAsCoordinator()->post(route('convocations.open', $convocation))->assertRedirect();

        return $convocation->fresh();
    }

    private function transition(SyllabusProcess $process, string $transition, ?string $reason = null): TestResponse
    {
        return $this->actingAsAdministrator()->post(
            route('admin.processes.transition', [$process, $transition]),
            $reason === null ? [] : ['reason' => $reason],
        );
    }

    private function publishedTemplate(): TemplateVersion
    {
        $this->actingAsAdministrator()->post(route('admin.templates.store'), ['nombre' => 'Plantilla I-31']);
        $template = TemplateVersion::query()->latest('creado_en')->firstOrFail();
        $this->actingAsAdministrator()->post(route('admin.templates.publish', $template))->assertRedirect();

        return $template->fresh();
    }

    private function coordinatorSource(): AcademicSource
    {
        $this->actingAsCoordinator()->post(route('sources.store'), [
            'nombre' => 'Fuente I-31',
            'description' => 'Documento de apoyo del periodo.',
        ])->assertRedirect();
        $source = AcademicSource::query()->latest('creado_en')->firstOrFail();
        $this->actingAsCoordinator()->put(route('sources.content.update', $source), [
            'content' => "## Perfil\n\nEvidencia académica autorizada.",
        ])->assertRedirect();

        return $source->fresh();
    }

    private function actingAsAdministrator(): static
    {
        $this->actingAs($this->administrator)->withSession(['active_role_assignment_id' => $this->administratorContext->id]);

        return $this;
    }

    private function actingAsCoordinator(): static
    {
        $this->actingAs($this->coordinator)->withSession(['active_role_assignment_id' => $this->coordinatorContext->id]);

        return $this;
    }

    private function actingAsTeacher(): static
    {
        $this->actingAs($this->teacher)->withSession(['active_role_assignment_id' => $this->teacherContext->id]);

        return $this;
    }
}
