<?php

namespace Tests\Feature\Syllabus;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
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
        $this->assertSame($process->academicPeriod->nombre, $process->nombre);
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'proceso_silabos.creado', 'recurso_id' => $process->id]);

        $this->actingAsAdministrator()->get(route('admin.processes.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Processes/Index')
                ->has('processes', 1)
                ->where('processes.0.state', 'preparacion'));
    }

    public function test_process_dates_arrive_as_days_and_cover_the_whole_deadline_day(): void
    {
        $template = $this->publishedTemplate();
        $start = now()->addDay()->toDateString();
        $due = now()->addMonth()->toDateString();

        $this->actingAsAdministrator()
            ->post(route('admin.processes.store'), [
                ...$this->processPayload($template),
                'nombre' => 'Proceso por días',
                'starts_at' => $start,
                'due_at' => $due,
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $process = SyllabusProcess::query()->firstOrFail();
        $this->assertSame("{$start} 00:00:00", $process->inicia_en->format('Y-m-d H:i:s'));
        $this->assertSame("{$due} 23:59:59", $process->entrega_en->format('Y-m-d H:i:s'));
    }

    public function test_a_process_requires_an_active_institutional_period(): void
    {
        $payload = $this->processPayload($this->publishedTemplate());
        unset($payload['period_id']);

        $this->actingAsAdministrator()->post(route('admin.processes.store'), $payload)
            ->assertSessionHasErrors('period_id');
    }

    public function test_coordination_lists_the_institutional_process_before_and_after_starting_its_career(): void
    {
        $process = $this->openProcess();
        $this->coordinatorSource();

        $this->actingAsCoordinator()->get(route('convocations.index', ['state' => 'sin_iniciar']))
            ->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('convocations.data', 1)
            ->where('convocations.data.0.process_id', $process->id)
            ->where('convocations.data.0.id', null)
            ->where('convocations.data.0.state', 'sin_iniciar')
            ->where('convocations.data.0.process_state', 'abierto'));

        $this->actingAsCoordinator()->post(route('convocations.store'), ['process_id' => $process->id])
            ->assertSessionHasNoErrors();
        $convocation = Convocation::query()->where('proceso_id', $process->id)->firstOrFail();

        $this->actingAsCoordinator()->get(route('convocations.index', ['state' => 'abierta']))
            ->assertOk()->assertInertia(fn (Assert $page) => $page
            ->has('convocations.data', 1)
            ->where('convocations.data.0.process_id', $process->id)
            ->where('convocations.data.0.id', $convocation->id)
            ->where('convocations.data.0.syllabi_count', 1));
        $this->actingAsCoordinator()->get(route('convocations.index', ['state' => 'sin_iniciar']))
            ->assertOk()->assertInertia(fn (Assert $page) => $page->has('convocations.data', 0));
    }

    public function test_only_one_process_can_be_in_progress(): void
    {
        $template = $this->publishedTemplate();
        $first = $this->preparedProcess($template, 'Primero');

        // Un período institucional identifica un único proceso, aun antes de abrirlo.
        $this->actingAsAdministrator()->post(route('admin.processes.store'), [
            ...$this->processPayload($template),
            'nombre' => 'Duplicado del período',
        ])->assertSessionHasErrors('period_id');

        $otherPeriod = AcademicPeriod::query()->create([
            'codigo' => 'I-46-ALTERNO',
            'nombre' => 'Período institucional alterno',
            'fecha_inicio' => '2027-01-01',
            'fecha_fin' => '2027-05-31',
            'activo' => true,
        ]);
        $second = $this->preparedProcess($template, 'Segundo', $otherPeriod->id);

        $this->transition($first, 'abrir')->assertRedirect()->assertSessionHas('success');
        $this->assertSame('abierto', $first->fresh()->estado);

        $this->actingAsAdministrator()->post(route('admin.processes.store'), [
            ...$this->processPayload($template),
            'period_id' => $second->periodo_academico_id,
        ])->assertSessionHasErrors('process');

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

    public function test_coordinator_starts_the_institutional_convocation_and_inherits_its_configuration(): void
    {
        $template = $this->publishedTemplate();
        $process = $this->preparedProcess($template, 'Elaboración 2026-2027');
        $source = $this->coordinatorSource();
        $otherPeriod = AcademicPeriod::query()->create([
            'codigo' => 'I-41-ALTERNO',
            'nombre' => 'Período institucional alterno',
            'fecha_inicio' => '2027-01-01',
            'fecha_fin' => '2027-05-31',
            'activo' => true,
        ]);

        $this->actingAsCoordinator()->post(route('convocations.store'), [
            'process_id' => $process->id,
        ])->assertSessionHasErrors('process_id');
        $this->assertDatabaseCount('convocatorias_carreras', 0);

        $this->transition($process, 'abrir')->assertRedirect();
        $this->actingAsCoordinator()->post(route('convocations.store'), [
            // El cliente no puede sustituir el período ni las fuentes fijadas por el flujo.
            'process_id' => $process->id,
            'period_id' => $otherPeriod->id,
            'source_ids' => [$source->id],
        ])->assertRedirect();

        $convocation = Convocation::query()->firstOrFail();
        $this->assertSame($process->id, $convocation->proceso_id);
        $this->assertSame($process->periodo_academico_id, $convocation->periodo_academico_id);
        $this->assertSame($template->id, $convocation->plantilla_id);
        $this->assertSame('abierta', $convocation->estado);
        $this->assertTrue($convocation->sources()->whereKey($source->id)->exists());
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

        $this->assertDatabaseCount('silabos', 1);

        // La regla también vive en PostgreSQL, por si una mutación evita el caso de uso.
        $this->expectException(QueryException::class);
        $convocation->update(['periodo_academico_id' => $otherPeriod->id]);
    }

    public function test_an_open_process_freezes_the_template_until_it_is_paused(): void
    {
        $process = $this->openProcess();
        $template = $process->template;
        $sectionPayload = [
            'title' => 'Anexos',
            'key' => 'anexos',
            'first_field_label' => 'Anexo',
            'first_field_key' => 'anexo',
            'first_field_content_type' => 'text',
        ];

        $this->actingAsAdministrator()->post(route('admin.templates.sections.store', $template), $sectionPayload)
            ->assertSessionHasErrors('process');
        $this->assertSame(12, $template->sections()->count());

        $this->actingAsAdministrator()->get(route('admin.templates.show', $template))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->whereNot('processLock', null));

        $this->transition($process, 'pausar', 'Hay que corregir el bloque de bibliografía.')->assertRedirect();

        $this->actingAsAdministrator()->post(route('admin.templates.sections.store', $template), $sectionPayload)
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertSame(13, $template->sections()->count());
        $this->actingAsAdministrator()->get(route('admin.templates.index'))
            ->assertRedirect(route('admin.templates.show', $template));
        $this->actingAsAdministrator()->get(route('admin.templates.show', $template))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('processLock', null));
    }

    public function test_changing_the_template_during_a_pause_asks_before_deleting_unsent_syllabi(): void
    {
        $convocation = $this->openedConvocation();
        $process = $convocation->process()->firstOrFail();
        $template = $process->template;
        $syllabus = Syllabus::query()->firstOrFail();
        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus))->assertRedirect();
        $this->transition($process, 'pausar', 'Ajuste de la plantilla con expedientes abiertos.')->assertRedirect();
        $sectionPayload = [
            'title' => 'Anexos',
            'key' => 'anexos',
            'first_field_label' => 'Anexo',
            'first_field_key' => 'anexo',
            'first_field_content_type' => 'text',
        ];

        // Sin confirmar: nada cambia y el servidor devuelve la cifra.
        $this->actingAsAdministrator()->post(route('admin.templates.sections.store', $template), $sectionPayload)
            ->assertSessionHasErrors(['purge_required', 'purge_count']);
        $this->assertDatabaseCount('silabos', 1);
        $this->assertSame(12, $template->sections()->count());

        // Confirmado: el borrador sin enviar se borra y el cambio se aplica.
        $this->actingAsAdministrator()
            ->post(route('admin.templates.sections.store', $template), [...$sectionPayload, 'confirm_purge' => 1])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertDatabaseCount('silabos', 0);
        $this->assertSame(13, $template->sections()->count());
    }

    public function test_changing_the_curriculum_during_a_pause_asks_before_deleting_unsent_syllabi(): void
    {
        $convocation = $this->openedConvocation();
        $curriculum = Curriculum::query()->firstOrFail();
        $this->actingAsCoordinator()
            ->post(route('convocations.transition', [$convocation, 'pausar']), ['reason' => 'Corrección de la malla con expedientes abiertos.'])
            ->assertRedirect();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', ['entity' => 'malla', 'record' => $curriculum->id]), ['code' => 'MALLA-NUEVA'])
            ->assertSessionHasErrors('purge_required');
        $this->assertDatabaseCount('silabos', 1);

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', ['entity' => 'malla', 'record' => $curriculum->id]), ['code' => 'MALLA-NUEVA', 'confirm_purge' => 1])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertDatabaseCount('silabos', 0);
        $this->assertSame('MALLA-NUEVA', $curriculum->fresh()->codigo);
    }

    public function test_a_running_convocation_freezes_curriculum_and_sources_of_its_career_only(): void
    {
        $convocation = $this->openedConvocation();
        $curriculum = Curriculum::query()->firstOrFail();
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

        // Con la convocatoria pausada la malla se edita; como hay un expediente sin
        // enviar, el cambio pide confirmación y lo borra (I-32).
        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', ['entity' => 'malla', 'record' => $curriculum->id]), [
                'code' => 'MALLA-CORREGIDA',
                'confirm_purge' => 1,
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

    public function test_an_open_cycle_freezes_every_structure_change_until_its_scope_is_paused(): void
    {
        $convocation = $this->openedConvocation();
        $offering = CourseOffering::query()->firstOrFail();

        // Una convocatoria abierta no admite alterar su oferta ni añadir paralelos:
        // los docentes ya recibieron los alcances generados al abrirla.
        $this->actingAsCoordinator()
            ->post(route('coordination.academic.parallels.store'), [
                'offering_id' => $offering->id,
                'codes' => ['B'],
                'shift' => 'matutina',
            ])
            ->assertSessionHasErrors('process');

        // El proceso abierto protege también los catálogos institucionales.
        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'campus'), [
                'code' => 'NUEVO-EN-CURSO',
                'nombre' => 'Campus no permitido durante el proceso',
            ])
            ->assertSessionHasErrors('process');
        $this->assertDatabaseMissing('campus', ['codigo_institucional' => 'NUEVO-EN-CURSO']);

        // Pausar solo la convocatoria libera exclusivamente a esa carrera.
        $this->actingAsCoordinator()
            ->post(route('convocations.transition', [$convocation, 'pausar']), ['reason' => 'Corrección controlada de paralelos.'])
            ->assertRedirect();
        $this->actingAsCoordinator()
            ->post(route('coordination.academic.parallels.store'), [
                'offering_id' => $offering->id,
                'codes' => ['B'],
                'shift' => 'matutina',
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        // La estructura institucional sigue congelada hasta que Administración pause
        // su proceso global.
        $process = $convocation->process()->firstOrFail();
        $this->transition($process, 'pausar', 'Corrección institucional autorizada.')->assertRedirect();
        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'campus'), [
                'code' => 'NUEVO-EN-PAUSA',
                'nombre' => 'Campus creado durante la pausa',
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertDatabaseHas('campus', ['codigo_institucional' => 'NUEVO-EN-PAUSA']);
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

    public function test_coordinator_cannot_edit_a_convocation_and_only_administration_closes_the_process(): void
    {
        $convocation = $this->openedConvocation();
        $source = AcademicSource::query()->firstOrFail();
        $payload = ['source_ids' => [$source->id]];

        $this->actingAsCoordinator()->patch('/coordinacion/convocatorias/'.$convocation->id, $payload)->assertMethodNotAllowed();

        $this->actingAsCoordinator()
            ->post(route('convocations.transition', [$convocation, 'pausar']), ['reason' => 'Corrección de la malla antes de continuar.'])
            ->assertRedirect();
        $this->actingAsCoordinator()->patch('/coordinacion/convocatorias/'.$convocation->id, $payload)->assertMethodNotAllowed();
        $this->assertSame($convocation->career->nombre.' · '.$convocation->academicPeriod->nombre, $convocation->fresh()->nombre);

        // Cerrar no es de la carrera: lo decide Administración cerrando el proceso.
        $this->actingAsCoordinator()->post(route('convocations.transition', [$convocation, 'cerrar']))->assertNotFound();
        $syllabus = Syllabus::query()->firstOrFail();
        $this->transition($convocation->process()->firstOrFail(), 'cerrar')->assertRedirect();
        $this->assertSame('pausada', $convocation->fresh()->estado);
        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus))->assertForbidden();
    }

    public function test_process_configuration_changes_only_in_preparation_or_pause(): void
    {
        $process = $this->openProcess();
        $payload = $this->processPayload($process->template);

        $this->actingAsAdministrator()->patch(route('admin.processes.update', $process), $payload)
            ->assertForbidden();

        $this->transition($process, 'pausar', 'Se corrige la fecha de entrega.')->assertRedirect();
        $this->actingAsAdministrator()->patch(route('admin.processes.update', $process), $payload)
            ->assertRedirect()
            ->assertSessionHas('success');
        $this->assertSame($process->academicPeriod->nombre, $process->fresh()->nombre);
    }

    public function test_period_of_a_process_with_convocations_cannot_change(): void
    {
        $process = $this->preparedProcess($this->publishedTemplate(), 'Proceso con convocatoria');
        $source = $this->coordinatorSource();
        $this->transition($process, 'abrir')->assertRedirect();
        $this->actingAsCoordinator()->post(route('convocations.store'), [
            'process_id' => $process->id,
        ])->assertRedirect();
        $this->transition($process, 'pausar', 'El período no puede reasignarse tras iniciar convocatorias.')->assertRedirect();
        $otherPeriod = AcademicPeriod::query()->create([
            'codigo' => 'I-41-NO-CAMBIAR',
            'nombre' => 'Período no reasignable',
            'fecha_inicio' => '2027-06-01',
            'fecha_fin' => '2027-10-31',
            'activo' => true,
        ]);

        $this->actingAsAdministrator()->patch(route('admin.processes.update', $process), [
            ...$this->processPayload($process->template),
            'period_id' => $otherPeriod->id,
        ])->assertSessionHasErrors('period_id');
    }

    /** @return array{period_id: string, starts_at: string, due_at: string} */
    private function processPayload(SyllabusTemplate $template): array
    {
        return [
            'period_id' => AcademicPeriod::query()->where('activo', true)->valueOrFail('id'),
            'starts_at' => now()->subDay()->toIso8601String(),
            'due_at' => now()->addMonth()->toIso8601String(),
        ];
    }

    private function preparedProcess(SyllabusTemplate $template, string $name, ?string $periodId = null): SyllabusProcess
    {
        $this->actingAsAdministrator()
            ->post(route('admin.processes.store'), [...$this->processPayload($template), 'nombre' => $name, ...($periodId === null ? [] : ['period_id' => $periodId])])
            ->assertRedirect();

        return SyllabusProcess::query()->where('periodo_academico_id', $periodId ?? $this->processPayload($template)['period_id'])->firstOrFail();
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
            'process_id' => $process->id,
        ])->assertRedirect();
        $convocation = Convocation::query()->where('proceso_id', $process->id)->firstOrFail();

        return $convocation->fresh();
    }

    private function transition(SyllabusProcess $process, string $transition, ?string $reason = null): TestResponse
    {
        return $this->actingAsAdministrator()->post(
            route('admin.processes.transition', [$process, $transition]),
            $reason === null ? [] : ['reason' => $reason],
        );
    }

    private function publishedTemplate(): SyllabusTemplate
    {
        $this->actingAsAdministrator()->post(route('admin.templates.store'), ['nombre' => 'Plantilla I-31']);
        $template = SyllabusTemplate::query()->latest('creado_en')->firstOrFail();

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
