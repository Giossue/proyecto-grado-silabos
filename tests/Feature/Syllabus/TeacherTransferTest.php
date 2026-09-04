<?php

namespace Tests\Feature\Syllabus;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Infrastructure\Persistence\Models\AuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Support\CreatesSyllabusProcess;
use Tests\TestCase;

/**
 * El sílabo pertenece a la asignatura y el periodo, no al docente. Relevar a quien
 * responde por él no crea un expediente nuevo: cierra una vigencia, abre otra y decide
 * qué pasa con el contenido según el estado, conforme a A1, B1, B2 y DT-08.
 */
class TeacherTransferTest extends TestCase
{
    use CreatesSyllabusProcess;
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    private User $coordinator;

    private RoleAssignment $coordinatorContext;

    private User $teacher;

    private RoleAssignment $teacherContext;

    private User $replacement;

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
        $this->replacement = $this->createReplacementTeacher();
    }

    public function test_transferring_an_untouched_syllabus_moves_the_assignment_and_records_the_backing(): void
    {
        $syllabus = $this->openedSyllabus();

        $this->transfer($syllabus)->assertRedirect()->assertSessionHas('success');

        // El expediente es el mismo: no se creó otro.
        $this->assertDatabaseCount('silabos', 1);
        $this->assertDatabaseHas('colaboradores_silabo', [
            'silabo_id' => $syllabus->id,
            'usuario_id' => $this->replacement->id,
        ]);
        $this->assertDatabaseMissing('colaboradores_silabo', [
            'silabo_id' => $syllabus->id,
            'usuario_id' => $this->teacher->id,
        ]);

        // La vigencia anterior se cierra, no se borra: el historial se conserva.
        $this->assertDatabaseHas('asignaciones_docente', [
            'usuario_id' => $this->teacher->id,
            'activo' => false,
        ]);
        $this->assertDatabaseHas('asignaciones_docente', [
            'usuario_id' => $this->replacement->id,
            'activo' => true,
            'sustento_tipo' => 'accion_personal',
            'sustento_numero' => 'UEB-RECT-2026-0142-R',
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'silabo.docente_transferido',
            'recurso_id' => $syllabus->id,
        ]);
    }

    public function test_an_unsubmitted_draft_is_discarded_and_the_lost_progress_stays_in_the_audit_trail(): void
    {
        $syllabus = $this->validDraft();
        $this->assertGreaterThan(0, (float) $syllabus->porcentaje_completitud);
        $this->assertGreaterThan(0, $syllabus->values()->where('heredado', false)->count());

        $this->transfer($syllabus)->assertRedirect();

        $syllabus->refresh();
        $this->assertSame('sin_iniciar', $syllabus->estado);
        $this->assertSame(0.0, (float) $syllabus->porcentaje_completitud);
        $this->assertSame(0, $syllabus->values()->count());
        $this->assertSame(0, $syllabus->rows()->count());

        $event = AuditEvent::query()->where('accion', 'silabo.docente_transferido')->firstOrFail();
        $this->assertSame('borrador', $event->metadatos['previous_state']);
        $this->assertGreaterThan(0, $event->metadatos['discarded_completion']);
    }

    public function test_an_approved_syllabus_is_reopened_and_keeps_the_approved_revision_intact(): void
    {
        $syllabus = $this->approvedSyllabus();
        $revisionCount = $syllabus->revisions()->count();

        $this->transfer($syllabus)->assertRedirect();

        $syllabus->refresh();
        $this->assertSame('correccion_solicitada', $syllabus->estado);
        // La revisión aprobada y su aprobación siguen ahí: ADR-0005.
        $this->assertSame($revisionCount, $syllabus->revisions()->count());
        $this->assertDatabaseCount('aprobaciones', 1);
        $this->assertDatabaseHas('reaperturas', ['silabo_id' => $syllabus->id]);
        // El contenido llega al docente entrante, no se pierde.
        $this->assertGreaterThan(0, $syllabus->values()->count());
    }

    public function test_a_syllabus_under_review_is_not_transferred(): void
    {
        $syllabus = $this->submittedSyllabus();

        $this->transfer($syllabus)->assertForbidden();

        $this->assertDatabaseHas('colaboradores_silabo', [
            'silabo_id' => $syllabus->id,
            'usuario_id' => $this->teacher->id,
        ]);
    }

    public function test_the_replacement_must_teach_in_the_same_career(): void
    {
        $syllabus = $this->openedSyllabus();
        $outsider = User::query()->create([
            'nombre' => 'Docente de otra carrera',
            'correo_electronico' => 'ajeno@silabos.test',
            'contrasena' => 'Temporal-2026!',
            'activo' => true,
        ]);

        $this->transfer($syllabus, $outsider->id)->assertSessionHasErrors('incoming_user_id');
    }

    public function test_the_transfer_requires_a_backing_document(): void
    {
        $syllabus = $this->openedSyllabus();

        $this->actingAsCoordinator()->post(route('reviews.teacher.transfer', $syllabus), [
            'outgoing_user_id' => $this->teacher->id,
            'incoming_user_id' => $this->replacement->id,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertSessionHasErrors(['backing_type', 'backing_number', 'backing_date']);
    }

    public function test_only_the_coordinator_of_the_career_transfers(): void
    {
        $syllabus = $this->openedSyllabus();

        $this->actingAsTeacher()->post(route('reviews.teacher.transfer', $syllabus), [
            'outgoing_user_id' => $this->teacher->id,
            'incoming_user_id' => $this->replacement->id,
            'backing_type' => 'resolucion',
            'backing_number' => 'R-001',
            'backing_date' => now()->subDay()->toDateString(),
            'idempotency_key' => (string) Str::uuid(),
        ])->assertForbidden();
    }

    private function transfer(Syllabus $syllabus, ?string $incomingId = null): TestResponse
    {
        return $this->actingAsCoordinator()->post(route('reviews.teacher.transfer', $syllabus), [
            'outgoing_user_id' => $this->teacher->id,
            'incoming_user_id' => $incomingId ?? $this->replacement->id,
            'backing_type' => 'accion_personal',
            'backing_number' => 'UEB-RECT-2026-0142-R',
            'backing_date' => now()->subDay()->toDateString(),
            'idempotency_key' => (string) Str::uuid(),
        ]);
    }

    private function createReplacementTeacher(): User
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $role = Role::query()->where('codigo', RoleCode::Teacher->value)->firstOrFail();
        $user = User::query()->create([
            'nombre' => 'Docente Suplente',
            'correo_electronico' => 'suplente@silabos.test',
            'contrasena' => 'Temporal-2026!',
            'activo' => true,
        ]);
        RoleAssignment::query()->create([
            'usuario_id' => $user->id,
            'rol_id' => $role->id,
            'carrera_id' => $career->id,
            'vigente_desde' => now()->subMonth(),
            'activo' => true,
        ]);

        return $user;
    }

    private function approvedSyllabus(): Syllabus
    {
        $syllabus = $this->submittedSyllabus();
        $revision = $syllabus->revisions()->orderByDesc('numero_revision')->firstOrFail();
        $this->actingAsCoordinator()->post(route('reviews.approve', $revision), [
            'idempotency_key' => (string) Str::uuid(),
        ])->assertRedirect();

        return $syllabus->fresh();
    }

    private function submittedSyllabus(): Syllabus
    {
        $syllabus = $this->validDraft();
        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'version_bloqueo' => $syllabus->version_bloqueo,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertRedirect();

        return $syllabus->fresh();
    }

    private function validDraft(): Syllabus
    {
        $syllabus = $this->openedSyllabus();
        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus))->assertRedirect();
        $fields = FieldDefinition::query()
            ->where('plantilla_id', $syllabus->plantilla_id)
            ->where('obligatorio', true)
            ->where('heredado', false)
            ->get();
        foreach ($fields as $field) {
            $this->actingAsTeacher()->patchJson(
                route('syllabi.fields.update', [$syllabus, $field]),
                $this->validFieldPayload($field, $syllabus->fresh()->version_bloqueo),
            )->assertOk();
        }

        return $syllabus->fresh();
    }

    private function openedSyllabus(): Syllabus
    {
        [$template, $source] = $this->publishedConfiguration();
        $this->actingAsCoordinator()->post(route('convocations.store'), [
            'nombre' => 'Convocatoria de relevo',
            'period_id' => CourseOffering::query()->firstOrFail()->periodo_academico_id,
            'process_id' => $this->openSyllabusProcess($template->id, now()->subDay()->toIso8601String(), now()->addMonth()->toIso8601String())->id,
            'grouping_mode' => 'por_paralelo',
            'source_ids' => [$source->id],
        ])->assertRedirect();
        $convocation = Convocation::query()->latest('creado_en')->firstOrFail();

        return Syllabus::query()->firstOrFail();
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
            'repetible' => ['version_bloqueo' => $lockVersion, 'rows' => [['data' => ['texto' => "Contenido {$field->clave}"]]]],
            'booleano' => ['version_bloqueo' => $lockVersion, 'value' => true],
            'numero' => ['version_bloqueo' => $lockVersion, 'value' => 1],
            'fecha' => ['version_bloqueo' => $lockVersion, 'value' => now()->toDateString()],
            'seleccion_unica' => ['version_bloqueo' => $lockVersion, 'value' => $optionValues->first()],
            'seleccion_multiple' => ['version_bloqueo' => $lockVersion, 'value' => [$optionValues->first()]],
            default => ['version_bloqueo' => $lockVersion, 'value' => "Contenido académico {$field->clave}"],
        };
    }

    /** @return array{SyllabusTemplate, AcademicSource} */
    private function publishedConfiguration(): array
    {
        $this->actingAsAdministrator()->post(route('admin.templates.store'), ['nombre' => 'Plantilla relevo']);
        $template = SyllabusTemplate::query()->latest('creado_en')->firstOrFail();

        $this->actingAsCoordinator()->post(route('sources.store'), [
            'nombre' => 'Fuente relevo',
            'description' => 'Documento de apoyo del periodo.',
        ]);
        $source = AcademicSource::query()->latest('creado_en')->firstOrFail();
        $this->actingAsCoordinator()->put(route('sources.content.update', $source), [
            'content' => '## Perfil base

Evidencia académica autorizada.',
        ]);

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
