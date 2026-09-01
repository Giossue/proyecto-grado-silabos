<?php

namespace Tests\Feature\Syllabus;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Application\RevisionDiff;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Approval;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ObservationResponse;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ReviewObservation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusTransition;
use App\Support\CanonicalHasher;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use LogicException;
use Tests\TestCase;

class ReviewWorkflowTest extends TestCase
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

    public function test_cp_f_revision_submission_is_validated_idempotent_and_immutable(): void
    {
        $syllabus = $this->createValidDraft();
        $lockVersion = $syllabus->lock_version;
        $key = (string) Str::uuid();

        $this->actingAsTeacher()
            ->get(route('syllabi.submit.confirm', $syllabus))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Teacher/Syllabi/Submit')
                ->where('syllabus.lock_version', $lockVersion));
        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $lockVersion,
            'idempotency_key' => $key,
        ])->assertRedirect(route('syllabi.show', $syllabus));

        $revision = SyllabusRevision::query()->firstOrFail();
        $this->assertSame('in_review', $syllabus->fresh()->estado);
        $this->assertSame(1, $revision->numero_revision);
        $this->assertSame($syllabus->version_plantilla_id, $revision->snapshot['template_version_id']);
        $this->assertSame($syllabus->contexto_academico, $revision->snapshot['academic_context']);
        $this->assertNotEmpty($revision->snapshot['sections']);
        $this->assertSame(app(CanonicalHasher::class)->hash($revision->snapshot), $revision->huella_sha256);
        $this->assertDatabaseHas('transiciones_silabo', [
            'silabo_id' => $syllabus->id,
            'accion' => 'submit',
            'estado_origen' => 'draft',
            'estado_destino' => 'in_review',
        ]);
        $this->assertDatabaseHas('eventos_outbox', [
            'agregado_id' => $syllabus->id,
            'tipo_evento' => 'syllabus.submitted',
        ]);

        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $lockVersion,
            'idempotency_key' => $key,
        ])->assertRedirect();
        $this->assertDatabaseCount('revisiones_silabo', 1);
        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $syllabus->fresh()->lock_version,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertSessionHasErrors('syllabus');
        $this->assertDatabaseCount('revisiones_silabo', 1);

        $originalFingerprint = $revision->huella_sha256;
        try {
            $revision->update(['huella_sha256' => str_repeat('0', 64)]);
            $this->fail('El modelo permitió modificar una revisión histórica.');
        } catch (LogicException) {
            $this->assertSame($originalFingerprint, $revision->fresh()->huella_sha256);
        }

        try {
            DB::transaction(fn () => DB::table('revisiones_silabo')
                ->where('id', $revision->id)
                ->update(['huella_sha256' => str_repeat('0', 64)]));
            $this->fail('PostgreSQL permitió modificar una revisión histórica.');
        } catch (QueryException) {
            $this->assertSame($originalFingerprint, $revision->fresh()->huella_sha256);
        }
    }

    public function test_cp_f_blocking_validation_prevents_submission_without_partial_state(): void
    {
        $syllabus = $this->createStartedDraft();

        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $syllabus->lock_version,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertSessionHasErrors('validation');

        $this->assertSame('draft', $syllabus->fresh()->estado);
        $this->assertDatabaseCount('revisiones_silabo', 0);
        $this->assertDatabaseCount('ejecuciones_validacion', 1);
        $this->assertDatabaseMissing('transiciones_silabo', ['silabo_id' => $syllabus->id]);
    }

    public function test_cp_f_stale_submission_returns_to_confirmation_without_creating_evidence(): void
    {
        $syllabus = $this->createValidDraft();
        $staleVersion = $syllabus->lock_version;
        $syllabus->increment('lock_version');

        $this->actingAsTeacher()
            ->from(route('syllabi.submit.confirm', $syllabus))
            ->post(route('syllabi.submit.store', $syllabus), [
                'lock_version' => $staleVersion,
                'idempotency_key' => (string) Str::uuid(),
            ])->assertRedirect(route('syllabi.submit.confirm', $syllabus))
            ->assertSessionHasErrors('lock_version');

        $this->assertSame('draft', $syllabus->fresh()->estado);
        $this->assertDatabaseCount('revisiones_silabo', 0);
        $this->assertDatabaseCount('ejecuciones_validacion', 0);
    }

    public function test_cp_f_review_workspace_enforces_role_and_record_scope(): void
    {
        [$syllabus, $revision] = $this->submitValidDraft();

        $this->actingAsCoordinator()
            ->get(route('reviews.show', $revision))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Reviews/Show')
                ->where('revision.number', 1)
                ->where('syllabus.id', $syllabus->id));
        $this->actingAsTeacher()->get(route('reviews.show', $revision))->assertForbidden();
        $this->actingAsAdministrator()->get(route('reviews.show', $revision))->assertForbidden();

        $career = Career::query()->create([
            'facultad_id' => Career::query()->firstOrFail()->facultad_id,
            'codigo_institucional' => 'OTRA-CARRERA',
            'nombre' => 'Otra carrera',
            'activo' => true,
        ]);
        $this->coordinatorContext->update(['carrera_id' => $career->id]);
        CoordinatorAssignment::query()->create([
            'usuario_id' => $this->coordinator->id,
            'carrera_id' => $career->id,
            'vigente_desde' => now()->subDay(),
            'vigente_hasta' => null,
            'activo' => true,
        ]);
        $this->actingAsCoordinator()->get(route('reviews.show', $revision))->assertForbidden();
    }

    public function test_cp_f_correction_preserves_first_snapshot_and_links_response_to_resubmission(): void
    {
        [$syllabus, $firstRevision] = $this->submitValidDraft();
        $field = $this->editableScalarField($syllabus);
        $repeatableField = FieldDefinition::query()
            ->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('tipo', 'repeatable')
            ->firstOrFail();
        $stableRowId = $syllabus->rows()
            ->where('definicion_campo_id', $repeatableField->id)
            ->firstOrFail()
            ->id;
        $firstSnapshot = $firstRevision->snapshot;

        $this->actingAsCoordinator()->post(route('reviews.observations.store', $firstRevision), [
            'content' => 'Precise la descripción y explique el ajuste realizado.',
        ])->assertRedirect();
        $observation = ReviewObservation::query()->firstOrFail();
        $this->actingAsCoordinator()->post(route('reviews.correction.store', $firstRevision), [
            'observation_ids' => [$observation->id],
            'justification' => 'Se requiere precisión académica antes de aprobar la revisión.',
        ])->assertRedirect();

        $syllabus->refresh();
        $this->assertSame('correction_requested', $syllabus->estado);
        $this->assertDatabaseHas('eventos_outbox', [
            'agregado_id' => $syllabus->id,
            'tipo_evento' => 'syllabus.correction_requested',
        ]);
        $this->actingAsCoordinator()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), [
            'lock_version' => $syllabus->lock_version,
            'value' => 'PV-16 continúa denegada.',
        ])->assertForbidden();
        $this->actingAsTeacher()
            ->get(route('syllabi.edit', $syllabus))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Teacher/Syllabi/Edit')
                ->where('syllabus.observations.0.requested', true));

        $this->actingAsTeacher()->post(route('syllabi.observations.respond', [$syllabus, $observation]), [
            'content' => 'Se amplió la descripción según la observación.',
        ])->assertRedirect();
        $this->actingAsCoordinator()
            ->post(route('reviews.observations.verify', $observation))
            ->assertSessionHasErrors('syllabus');

        $syllabus->refresh();
        $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), [
            'lock_version' => $syllabus->lock_version,
            'value' => 'Descripción corregida con evidencia académica.',
        ])->assertOk();
        $syllabus->refresh();
        $rowUpdate = $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $repeatableField]), [
            'lock_version' => $syllabus->lock_version,
            'rows' => [
                ['id' => $stableRowId, 'data' => ['texto' => 'Fila corregida y estable']],
                ['data' => ['texto' => 'Fila nueva de la corrección']],
            ],
        ])->assertOk();
        $newRowId = $rowUpdate->json('rows.1.id');
        $syllabus->refresh();
        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $syllabus->lock_version,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertRedirect();

        $secondRevision = SyllabusRevision::query()->where('numero_revision', 2)->firstOrFail();
        $this->assertSame($firstSnapshot, $firstRevision->fresh()->snapshot);
        $this->assertNotSame($firstRevision->huella_sha256, $secondRevision->huella_sha256);
        $this->assertSame($firstRevision->id, $secondRevision->revision_anterior_id);
        $response = ObservationResponse::query()->firstOrFail();
        $this->assertSame($secondRevision->id, $response->revision_respuesta_id);
        $comparison = app(RevisionDiff::class)->compare($firstRevision, $secondRevision);
        $this->assertGreaterThan(0, $comparison['changed_fields']);
        $repeatableChange = collect($comparison['changes'])->firstWhere('type', 'repeatable');
        $this->assertSame($stableRowId, $repeatableChange['before']['rows'][0]['id'], 'La fila estable no coincide en el snapshot anterior.');
        $this->assertSame($stableRowId, $repeatableChange['after']['rows'][0]['id'], 'La fila estable no coincide en el snapshot posterior.');
        $this->assertSame($newRowId, $repeatableChange['after']['rows'][1]['id'], 'La fila nueva no coincide en el snapshot posterior.');

        $this->actingAsCoordinator()->post(route('reviews.observations.verify', $observation))->assertRedirect();
        $this->assertSame('verified', $observation->fresh()->estado);
        try {
            DB::transaction(fn () => DB::table('respuestas_observacion')
                ->where('id', $response->id)
                ->update(['contenido' => 'Intento de reescritura histórica.']));
            $this->fail('PostgreSQL permitió modificar una respuesta ya enviada.');
        } catch (QueryException) {
            $this->assertSame(
                'Se amplió la descripción según la observación.',
                $response->fresh()->contenido,
            );
        }
        $this->actingAsTeacher()
            ->get(route('reviews.compare', [$firstRevision, $secondRevision]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Syllabi/Compare')
                ->where('comparison.before_revision', 1)
                ->where('comparison.after_revision', 2));
    }

    public function test_cp_f_approval_requires_verified_observations_and_is_idempotent(): void
    {
        [$syllabus, $revision] = $this->submitValidDraft();
        $this->actingAsCoordinator()->post(route('reviews.observations.store', $revision), [
            'content' => 'Confirme que el contenido actual satisface el criterio.',
        ]);
        $observation = ReviewObservation::query()->firstOrFail();
        $key = (string) Str::uuid();

        $this->actingAsCoordinator()->post(route('reviews.approve', $revision), [
            'idempotency_key' => $key,
        ])->assertSessionHasErrors('observations');
        $this->assertSame('in_review', $syllabus->fresh()->estado);
        $this->assertDatabaseCount('aprobaciones', 0);

        $this->actingAsCoordinator()->post(route('reviews.observations.verify', $observation))->assertRedirect();
        $this->actingAsCoordinator()->post(route('reviews.approve', $revision), [
            'idempotency_key' => $key,
        ])->assertRedirect();
        $approval = Approval::query()->firstOrFail();
        $this->assertSame('approved', $syllabus->fresh()->estado);
        $this->assertSame($revision->id, $approval->revision_silabo_id);
        $this->assertSame(64, strlen($approval->huella_sha256));
        $this->assertDatabaseHas('eventos_outbox', [
            'agregado_id' => $syllabus->id,
            'tipo_evento' => 'syllabus.approved',
        ]);

        $this->actingAsCoordinator()->post(route('reviews.approve', $revision), [
            'idempotency_key' => $key,
        ])->assertRedirect();
        $this->assertDatabaseCount('aprobaciones', 1);

        $this->actingAsCoordinator()->post(route('reviews.approve', $revision), [
            'idempotency_key' => (string) Str::uuid(),
        ])->assertSessionHasErrors('revision');
    }

    public function test_cp_f_reopening_preserves_approval_restores_snapshot_and_links_next_revision(): void
    {
        [$syllabus, $approvedRevision] = $this->submitValidDraft();
        $this->actingAsCoordinator()->post(route('reviews.approve', $approvedRevision), [
            'idempotency_key' => (string) Str::uuid(),
        ])->assertRedirect();
        $approval = Approval::query()->firstOrFail();
        $field = $this->editableScalarField($syllabus);
        $approvedValue = $syllabus->values()->where('definicion_campo_id', $field->id)->firstOrFail()->valor;
        $syllabus->values()->where('definicion_campo_id', $field->id)->firstOrFail()->update([
            'valor' => 'Deriva fuera del flujo que debe descartarse.',
        ]);
        $key = (string) Str::uuid();

        $this->actingAsCoordinator()->post(route('reviews.reopen', $syllabus), [
            'idempotency_key' => $key,
            'cause' => 'Se detectó una actualización académica posterior a la aprobación.',
        ])->assertRedirect();
        $syllabus->refresh();
        $reopening = $syllabus->reopenings()->firstOrFail();
        $this->assertSame('correction_requested', $syllabus->estado);
        $this->assertSame($approvedValue, $syllabus->values()->where('definicion_campo_id', $field->id)->firstOrFail()->valor);
        $this->assertSame($approval->id, $reopening->aprobacion_id);
        $this->assertDatabaseCount('aprobaciones', 1);
        $this->assertDatabaseCount('revisiones_silabo', 1);
        $this->assertDatabaseHas('eventos_outbox', [
            'agregado_id' => $syllabus->id,
            'tipo_evento' => 'syllabus.reopened',
        ]);

        $this->actingAsCoordinator()->post(route('reviews.reopen', $syllabus), [
            'idempotency_key' => $key,
            'cause' => 'Se detectó una actualización académica posterior a la aprobación.',
        ])->assertRedirect();
        $this->assertDatabaseCount('reaperturas', 1);

        $this->actingAsCoordinator()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), [
            'lock_version' => $syllabus->lock_version,
            'value' => 'Coordinación no puede editar mientras PV-16 esté pendiente.',
        ])->assertForbidden();
        $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), [
            'lock_version' => $syllabus->lock_version,
            'value' => 'Cambio posterior a la reapertura.',
        ])->assertOk();
        $syllabus->refresh();
        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $syllabus->lock_version,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertRedirect();

        $newRevision = SyllabusRevision::query()->where('numero_revision', 2)->firstOrFail();
        $this->assertSame($reopening->id, $newRevision->reapertura_id);
        $this->assertSame($approvedRevision->id, $approval->fresh()->revision_silabo_id);
        $this->assertSame('in_review', $syllabus->fresh()->estado);
    }

    public function test_cp_f_database_rejects_invalid_transition_and_cross_syllabus_evidence(): void
    {
        [$syllabus, $revision] = $this->submitValidDraft();
        $otherSyllabus = Syllabus::query()->create([
            'convocatoria_id' => $syllabus->convocatoria_id,
            'asignatura_id' => $syllabus->asignatura_id,
            'version_malla_id' => $syllabus->version_malla_id,
            'version_plantilla_id' => $syllabus->version_plantilla_id,
            'estado' => 'in_review',
            'lock_version' => 1,
            'porcentaje_completitud' => 100,
            'iniciado_en' => now(),
            'guardado_en' => now(),
        ]);
        $otherRevision = SyllabusRevision::query()->create([
            'silabo_id' => $otherSyllabus->id,
            'numero_revision' => 1,
            'clave_idempotencia' => (string) Str::uuid(),
            'lock_version_origen' => 1,
            'snapshot' => $revision->snapshot,
            'huella_sha256' => app(CanonicalHasher::class)->hash($revision->snapshot),
            'enviado_por' => $this->teacher->id,
            'enviado_en' => now(),
        ]);

        $this->actingAsCoordinator()
            ->from(route('reviews.show', $revision))
            ->get(route('reviews.compare', [$revision, $otherRevision]))
            ->assertRedirect(route('reviews.show', $revision))
            ->assertSessionHasErrors('revisions');

        try {
            DB::transaction(fn () => SyllabusTransition::query()->create([
                'silabo_id' => $syllabus->id,
                'revision_silabo_id' => $revision->id,
                'estado_origen' => 'draft',
                'estado_destino' => 'approved',
                'accion' => 'approve',
                'actor_usuario_id' => $this->coordinator->id,
                'asignacion_rol_id' => $this->coordinatorContext->id,
                'ocurrido_en' => now(),
            ]));
            $this->fail('PostgreSQL permitió una transición inválida.');
        } catch (QueryException) {
            $this->assertDatabaseMissing('transiciones_silabo', [
                'silabo_id' => $syllabus->id,
                'estado_origen' => 'draft',
                'estado_destino' => 'approved',
            ]);
        }

        try {
            DB::transaction(fn () => Approval::query()->create([
                'silabo_id' => $otherSyllabus->id,
                'revision_silabo_id' => $revision->id,
                'clave_idempotencia' => (string) Str::uuid(),
                'huella_sha256' => str_repeat('a', 64),
                'aprobado_por' => $this->coordinator->id,
                'aprobado_en' => now(),
            ]));
            $this->fail('PostgreSQL permitió asociar una aprobación a otro sílabo.');
        } catch (QueryException) {
            $this->assertDatabaseCount('aprobaciones', 0);
        }
    }

    /** @return array{Syllabus, SyllabusRevision} */
    private function submitValidDraft(): array
    {
        $syllabus = $this->createValidDraft();
        $this->actingAsTeacher()->post(route('syllabi.submit.store', $syllabus), [
            'lock_version' => $syllabus->lock_version,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertRedirect();

        return [$syllabus->fresh(), SyllabusRevision::query()->latest('enviado_en')->firstOrFail()];
    }

    private function createValidDraft(): Syllabus
    {
        $syllabus = $this->createStartedDraft();
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

    private function createStartedDraft(): Syllabus
    {
        [$template, $source] = $this->publishedConfiguration();
        $periodId = CourseOffering::query()->firstOrFail()->periodo_academico_id;
        $this->actingAsCoordinator()->post(route('convocations.store'), [
            'name' => 'Convocatoria I-04',
            'period_id' => $periodId,
            'template_version_id' => $template->id,
            'grouping_mode' => 'per_offering',
            'source_ids' => [$source->id],
            'start_date' => now()->subDay()->toIso8601String(),
            'draft_deadline' => now()->addMonth()->toIso8601String(),
        ])->assertRedirect();
        $convocation = Convocation::query()->latest('created_at')->firstOrFail();
        $this->actingAsCoordinator()->post(route('convocations.open', $convocation))->assertRedirect();
        $syllabus = Syllabus::query()->firstOrFail();
        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus))->assertRedirect();

        return $syllabus->fresh();
    }

    /** @return array{TemplateVersion, AcademicSource} */
    private function publishedConfiguration(): array
    {
        $this->actingAsAdministrator()->post(route('admin.templates.store'), ['name' => 'Plantilla I-04']);
        $template = TemplateVersion::query()->latest('created_at')->firstOrFail();
        $this->actingAsAdministrator()->post(route('admin.templates.publish', $template))->assertRedirect();

        $this->actingAsCoordinator()->post(route('sources.store'), [
            'name' => 'Fuente I-04',
            'description' => 'Documento de apoyo del periodo.',
        ])->assertRedirect();
        $source = AcademicSource::query()->latest('created_at')->firstOrFail();
        $this->actingAsCoordinator()->put(route('sources.content.update', $source), [
            'content' => "## Perfil I-04\n\nEvidencia I-04.",
        ])->assertRedirect();

        return [$template->fresh(), $source->fresh()];
    }

    private function editableScalarField(Syllabus $syllabus): FieldDefinition
    {
        return FieldDefinition::query()
            ->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('heredado', false)
            ->where('editable_docente', true)
            ->where('tipo', '!=', 'repeatable')
            ->firstOrFail();
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
