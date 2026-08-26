<?php

namespace Tests\Feature\Syllabus;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Infrastructure\Persistence\Models\AuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ConvocationDeadline;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Carbon\CarbonInterface;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * El reglamento de la UEB exige que la planificación microcurricular esté programada
 * antes de iniciar el periodo académico. Estas fechas son la forma de cumplirlo, así que
 * el vencimiento tiene que bloquear de verdad y la prórroga tiene que dejar rastro.
 */
class ConvocationScheduleTest extends TestCase
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

        $this->administrator = User::query()->where('email', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('email', 'coordinador@silabos.test')->firstOrFail();
        $this->coordinatorContext = $this->coordinator->roleAssignments()->firstOrFail();
        $this->teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $this->teacherContext = $this->teacher->roleAssignments()->firstOrFail();
    }

    public function test_a_convocation_records_both_the_start_and_the_deadline(): void
    {
        $convocation = $this->prepareConvocation();

        $this->assertDatabaseHas('fechas_limite_convocatoria', [
            'convocatoria_id' => $convocation->id,
            'etapa' => 'start',
        ]);
        $this->assertDatabaseHas('fechas_limite_convocatoria', [
            'convocatoria_id' => $convocation->id,
            'etapa' => 'draft',
        ]);
    }

    public function test_the_deadline_cannot_be_set_before_the_start(): void
    {
        [$template, $source] = $this->publishedConfiguration();

        $this->actingAsCoordinator()->post(route('convocations.store'), [
            'name' => 'Convocatoria invertida',
            'period_id' => CourseOffering::query()->firstOrFail()->periodo_academico_id,
            'template_version_id' => $template->id,
            'grouping_mode' => 'per_parallel',
            'source_version_ids' => [$source->id],
            'start_date' => now()->addMonths(2)->toIso8601String(),
            'draft_deadline' => now()->addMonth()->toIso8601String(),
        ])->assertSessionHasErrors('draft_deadline');
    }

    public function test_a_teacher_cannot_submit_before_the_convocation_starts(): void
    {
        $syllabus = $this->createValidDraft(startsAt: now()->addWeek());

        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $syllabus->lock_version,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertSessionHasErrors('deadline');

        $this->assertDatabaseCount('revisiones_silabo', 0);
    }

    public function test_a_teacher_cannot_submit_once_the_deadline_has_passed(): void
    {
        $syllabus = $this->createValidDraft();
        $this->expireDeadline($syllabus);

        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $syllabus->lock_version,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertSessionHasErrors('deadline');

        $this->assertDatabaseCount('revisiones_silabo', 0);
        $this->assertSame('draft', $syllabus->fresh()->estado);
    }

    public function test_an_extension_reopens_submission_and_keeps_the_previous_date_in_the_audit_trail(): void
    {
        $syllabus = $this->createValidDraft();
        $convocation = $this->expireDeadline($syllabus);
        $previous = $convocation->deadlines()->where('etapa', 'draft')->firstOrFail()->vence_en;

        $this->actingAsCoordinator()->post(route('convocations.deadline.extend', $convocation), [
            'stage' => 'draft',
            'due_at' => now()->addWeek()->toIso8601String(),
            'reason' => 'Relevo de docente por licencia médica del titular.',
        ])->assertRedirect()->assertSessionHas('success');

        $event = AuditEvent::query()
            ->where('accion', 'convocation.deadline_extended')
            ->firstOrFail();
        $this->assertSame($previous->toIso8601String(), $event->metadatos['previous_due_at']);
        $this->assertSame('draft', $event->metadatos['stage']);
        $this->assertStringContainsString('licencia', $event->metadatos['reason']);

        // Con el plazo movido, el envío que antes rebotaba ahora entra.
        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $syllabus->fresh()->lock_version,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertRedirect();
        $this->assertDatabaseCount('revisiones_silabo', 1);
    }

    public function test_an_extension_cannot_move_the_date_backwards(): void
    {
        $convocation = $this->prepareConvocation();

        $this->actingAsCoordinator()->post(route('convocations.deadline.extend', $convocation), [
            'stage' => 'draft',
            'due_at' => now()->addDay()->toIso8601String(),
            'reason' => 'Quiero adelantar el cierre porque ya casi todos entregaron.',
        ])->assertSessionHasErrors('due_at');
    }

    public function test_the_extension_requires_a_written_reason(): void
    {
        $convocation = $this->prepareConvocation();

        $this->actingAsCoordinator()->post(route('convocations.deadline.extend', $convocation), [
            'stage' => 'draft',
            'due_at' => now()->addMonths(2)->toIso8601String(),
            'reason' => 'porque sí',
        ])->assertSessionHasErrors('reason');
    }

    public function test_only_the_coordinator_of_the_career_extends_a_deadline(): void
    {
        $convocation = $this->prepareConvocation();
        $payload = [
            'stage' => 'draft',
            'due_at' => now()->addMonths(2)->toIso8601String(),
            'reason' => 'Ampliación por relevo docente en dos paralelos.',
        ];

        $this->actingAsTeacher()
            ->post(route('convocations.deadline.extend', $convocation), $payload)
            ->assertForbidden();

        $this->actingAs($this->administrator)
            ->withSession(['active_role_assignment_id' => $this->administratorContext->id])
            ->post(route('convocations.deadline.extend', $convocation), $payload)
            ->assertForbidden();
    }

    private function expireDeadline(Syllabus $syllabus): Convocation
    {
        $convocation = $syllabus->convocation;
        ConvocationDeadline::query()
            ->where('convocatoria_id', $convocation->id)
            ->where('etapa', 'draft')
            ->update(['vence_en' => now()->subDay()]);

        return $convocation->fresh();
    }

    private function createValidDraft(?CarbonInterface $startsAt = null): Syllabus
    {
        $convocation = $this->prepareConvocation($startsAt);
        $this->actingAsCoordinator()->post(route('convocations.open', $convocation))->assertRedirect();
        $syllabus = Syllabus::query()->firstOrFail();
        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus))->assertRedirect();

        $fields = FieldDefinition::query()
            ->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('obligatorio', true)
            ->where('heredado', false)
            ->get();
        foreach ($fields as $field) {
            $this->actingAsTeacher()->patchJson(
                route('syllabi.fields.update', [$syllabus, $field]),
                $this->validFieldPayload($field, $syllabus->fresh()->lock_version),
            )->assertOk();
        }

        return $syllabus->fresh();
    }

    private function prepareConvocation(?CarbonInterface $startsAt = null): Convocation
    {
        [$template, $source] = $this->publishedConfiguration();

        $this->actingAsCoordinator()->post(route('convocations.store'), [
            'name' => 'Convocatoria de plazos',
            'period_id' => CourseOffering::query()->firstOrFail()->periodo_academico_id,
            'template_version_id' => $template->id,
            'grouping_mode' => 'per_parallel',
            'source_version_ids' => [$source->id],
            'start_date' => ($startsAt ?? now()->subDay())->toIso8601String(),
            'draft_deadline' => now()->addMonth()->toIso8601String(),
        ])->assertRedirect();

        return Convocation::query()->latest('created_at')->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function validFieldPayload(FieldDefinition $field, int $lockVersion): array
    {
        $optionValues = collect($field->opciones ?? [])->map(function (mixed $option): string {
            if (is_array($option)) {
                return (string) ($option['value'] ?? 'opcion');
            }

            return (string) $option;
        })->filter()->values();

        return match ($field->tipo) {
            'repeatable' => ['lock_version' => $lockVersion, 'rows' => [['data' => ['texto' => "Contenido {$field->clave}"]]]],
            'boolean' => ['lock_version' => $lockVersion, 'value' => true],
            'number' => ['lock_version' => $lockVersion, 'value' => 1],
            'date' => ['lock_version' => $lockVersion, 'value' => now()->toDateString()],
            'single_select' => ['lock_version' => $lockVersion, 'value' => $optionValues->first()],
            'multi_select' => ['lock_version' => $lockVersion, 'value' => [$optionValues->first()]],
            default => ['lock_version' => $lockVersion, 'value' => "Contenido académico {$field->clave}"],
        };
    }

    /** @return array{TemplateVersion, SourceVersion} */
    private function publishedConfiguration(): array
    {
        $this->actingAsAdministrator()->post(route('admin.templates.store'), ['name' => 'Plantilla I-15']);
        $template = TemplateVersion::query()->latest('created_at')->firstOrFail();
        $this->actingAsAdministrator()->post(route('admin.templates.publish', $template));

        $this->actingAsCoordinator()->post(route('sources.store'), [
            'name' => 'Fuente I-15',
            'type' => 'malla',
            'authority' => 'Consejo académico',
            'responsible' => 'Coordinación de Software',
            'valid_from' => now()->toDateString(),
        ]);
        $source = SourceVersion::query()->latest('created_at')->firstOrFail();
        $this->actingAsCoordinator()->post(route('sources.fragments.store', $source), [
            'key' => 'perfil_base',
            'title' => 'Perfil base',
            'data_key' => 'perfil.base',
            'structured_value' => json_encode(['value' => 'Evidencia académica autorizada.'], JSON_THROW_ON_ERROR),
        ]);
        $this->actingAsCoordinator()->post(route('sources.versions.activate', $source));

        return [$template->fresh(), $source->fresh()];
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
