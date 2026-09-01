<?php

namespace Tests\Feature\Syllabus;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ValidationRun;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ConvocationAndDraftTest extends TestCase
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

    public function test_coordinator_opens_convocation_and_generates_scoped_syllabus_with_master_values(): void
    {
        $convocation = $this->createPreparedConvocation('per_offering');

        $this->actingAsCoordinator()
            ->post(route('convocations.open', $convocation))
            ->assertRedirect()
            ->assertSessionHas('success');

        $convocation->refresh();
        $syllabus = Syllabus::query()->firstOrFail();
        $this->assertSame('open', $convocation->estado);
        $this->assertSame('not_started', $syllabus->estado);
        $this->assertSame('Arquitectura de Software', data_get($syllabus->contexto_academico, 'subject.name'));
        $this->assertSame('MALLA-SW-2024', data_get($syllabus->contexto_academico, 'curriculum.code'));
        $this->assertCount(1, $syllabus->scopes()->get());
        $this->assertCount(1, $syllabus->collaborators()->get());
        $master = $syllabus->values()->where('heredado', true)->firstOrFail();
        $this->assertSame('Arquitectura de Software', $master->valor['nombre']);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'convocation.opened',
            'recurso_id' => $convocation->id,
        ]);

        $this->actingAsCoordinator()
            ->get(route('convocations.show', $convocation))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Convocations/Show')
                ->where('convocation.counts.total', 1)
                ->has('convocation.syllabi', 1));

        $this->actingAsCoordinator()
            ->post(route('convocations.open', $convocation))
            ->assertForbidden();
        $this->assertDatabaseCount('silabos', 1);
    }

    public function test_inactive_curriculum_blocks_opening_without_changing_existing_history(): void
    {
        $existing = $this->openConvocationAndGetSyllabus();
        $originalName = $existing->academicSubjectName();
        $curriculum = CurriculumVersion::query()->current()->firstOrFail();
        $curriculum->update(['estado' => 'inactive']);
        $existing->subject->update(['nombre' => 'Nombre nuevo en la malla']);

        $this->assertSame($originalName, $existing->fresh()->academicSubjectName());

        $convocation = $this->createPreparedConvocation('per_parallel');
        $this->actingAsCoordinator()
            ->post(route('convocations.open', $convocation))
            ->assertSessionHasErrors('convocation');
        $this->assertSame('preparation', $convocation->fresh()->estado);
        $this->assertDatabaseCount('silabos', 1);
    }

    public function test_explicit_per_parallel_mode_generates_one_syllabus_for_each_parallel(): void
    {
        $offering = CourseOffering::query()->firstOrFail();
        $parallel = Parallel::query()->create([
            'oferta_academica_id' => $offering->id,
            'codigo' => 'B',
            'activo' => true,
        ]);
        TeacherAssignment::query()->create([
            'usuario_id' => $this->teacher->id,
            'paralelo_id' => $parallel->id,
            'vigente_desde' => now()->subMonth(),
            'activo' => true,
        ]);
        $convocation = $this->createPreparedConvocation('per_parallel');

        $this->actingAsCoordinator()->post(route('convocations.open', $convocation))->assertRedirect();

        $this->assertSame(2, Syllabus::query()->count());
        $this->assertSame([1, 1], Syllabus::query()->withCount('scopes')->pluck('scopes_count')->all());
    }

    public function test_opening_is_atomic_when_a_parallel_has_no_current_teacher(): void
    {
        $offering = CourseOffering::query()->firstOrFail();
        Parallel::query()->create(['oferta_academica_id' => $offering->id, 'codigo' => 'B', 'activo' => true]);
        $convocation = $this->createPreparedConvocation('per_offering');

        $this->actingAsCoordinator()
            ->post(route('convocations.open', $convocation))
            ->assertSessionHasErrors('convocation');

        $this->assertSame('preparation', $convocation->fresh()->estado);
        $this->assertDatabaseCount('silabos', 0);
        $this->assertDatabaseMissing('eventos_auditoria', ['accion' => 'convocation.opened']);
    }

    public function test_archived_source_blocks_convocation_opening(): void
    {
        $convocation = $this->createPreparedConvocation('per_offering');
        AcademicSource::query()
            ->whereIn('id', $convocation->sources()->pluck('fuentes_academicas.id'))
            ->update(['activo' => false]);

        $this->actingAsCoordinator()
            ->post(route('convocations.open', $convocation))
            ->assertSessionHasErrors('convocation');

        $this->assertDatabaseCount('silabos', 0);
        $this->assertSame('preparation', $convocation->fresh()->estado);
    }

    public function test_teacher_starts_autosaves_and_stale_version_returns_recoverable_conflict(): void
    {
        $syllabus = $this->openConvocationAndGetSyllabus();

        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus))->assertRedirect(route('syllabi.edit', $syllabus));
        $syllabus->refresh();
        $field = FieldDefinition::query()
            ->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('clave', 'descripcion')->firstOrFail();

        $response = $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), [
            'lock_version' => 1,
            'value' => 'Descripción académica verificable.',
        ])->assertOk();

        $this->assertSame(2, $response->json('lock_version'));
        $this->assertDatabaseHas('valores_campo', ['silabo_id' => $syllabus->id, 'definicion_campo_id' => $field->id]);

        $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), [
            'lock_version' => 1,
            'value' => 'Escritura obsoleta.',
        ])->assertConflict()
            ->assertJsonPath('code', 'draft_version_conflict')
            ->assertJsonPath('current_lock_version', 2);

        $this->assertSame('Descripción académica verificable.', $syllabus->values()->where('definicion_campo_id', $field->id)->firstOrFail()->valor);
    }

    public function test_inherited_field_and_coordinator_edit_are_denied(): void
    {
        $syllabus = $this->openConvocationAndGetSyllabus();
        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus));
        $syllabus->refresh();
        $inherited = FieldDefinition::query()->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('heredado', true)->firstOrFail();

        $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $inherited]), [
            'lock_version' => $syllabus->lock_version,
            'value' => 'Intento de sobrescritura',
        ])->assertUnprocessable()->assertJsonValidationErrors('field');

        $editable = FieldDefinition::query()->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('editable_docente', true)->firstOrFail();
        $this->actingAsCoordinator()->patchJson(route('syllabi.fields.update', [$syllabus, $editable]), [
            'lock_version' => $syllabus->lock_version,
            'value' => 'PV-16 no autorizado',
        ])->assertForbidden();
    }

    public function test_autosave_enforces_template_type_and_rejects_html_in_markdown(): void
    {
        $syllabus = $this->openConvocationAndGetSyllabus();
        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus));
        $syllabus->refresh();
        $field = FieldDefinition::query()
            ->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('tipo', 'markdown')
            ->firstOrFail();

        $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), [
            'lock_version' => $syllabus->lock_version,
            'value' => '<script>contenido no permitido</script>',
        ])->assertUnprocessable()->assertJsonValidationErrors('value');

        $this->assertDatabaseMissing('valores_campo', [
            'silabo_id' => $syllabus->id,
            'definicion_campo_id' => $field->id,
        ]);
        $this->assertSame($syllabus->lock_version, $syllabus->fresh()->lock_version);
    }

    public function test_deterministic_validation_tracks_required_fields_without_ai(): void
    {
        $syllabus = $this->openConvocationAndGetSyllabus();
        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus));
        $syllabus->refresh();

        $this->actingAsTeacher()->post(route('syllabi.validate', $syllabus))->assertRedirect();
        $firstRun = ValidationRun::query()->latest('completado_en')->firstOrFail();
        $this->assertSame('baseline-v1', $firstRun->version_reglas);
        $this->assertGreaterThan(0, $firstRun->errores_bloqueantes);

        $requiredEditable = FieldDefinition::query()
            ->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('obligatorio', true)
            ->where('heredado', false)
            ->get();
        foreach ($requiredEditable as $field) {
            $payload = $field->tipo === 'repeatable'
                ? ['lock_version' => $syllabus->fresh()->lock_version, 'rows' => [['data' => ['texto' => "Contenido {$field->clave}"]]]]
                : ['lock_version' => $syllabus->fresh()->lock_version, 'value' => "Contenido {$field->clave}"];
            $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), $payload)->assertOk();
        }

        $this->actingAsTeacher()->post(route('syllabi.validate', $syllabus))->assertRedirect();
        $lastRun = ValidationRun::query()->whereKeyNot($firstRun->id)->firstOrFail();
        $this->assertSame(0, $lastRun->errores_bloqueantes);
        $this->assertSame('100.00', $lastRun->porcentaje_completitud);
    }

    public function test_repeatable_rows_keep_identity_when_an_earlier_row_is_removed(): void
    {
        $syllabus = $this->openConvocationAndGetSyllabus();
        $this->actingAsTeacher()->post(route('syllabi.start', $syllabus));
        $syllabus->refresh();
        $field = FieldDefinition::query()
            ->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('tipo', 'repeatable')
            ->firstOrFail();

        $created = $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), [
            'lock_version' => $syllabus->lock_version,
            'rows' => [
                ['data' => ['texto' => 'Primera fila']],
                ['data' => ['texto' => 'Segunda fila']],
            ],
        ])->assertOk();
        $secondRowId = $created->json('rows.1.id');

        $this->actingAsTeacher()->patchJson(route('syllabi.fields.update', [$syllabus, $field]), [
            'lock_version' => $created->json('lock_version'),
            'rows' => [
                ['id' => $secondRowId, 'data' => ['texto' => 'Segunda fila ajustada']],
            ],
        ])->assertOk()
            ->assertJsonCount(1, 'rows')
            ->assertJsonPath('rows.0.id', $secondRowId)
            ->assertJsonPath('rows.0.posicion', 1);

        $this->assertDatabaseMissing('filas_repetibles', ['datos->texto' => 'Primera fila']);
        $this->assertDatabaseHas('filas_repetibles', [
            'id' => $secondRowId,
            'posicion' => 1,
            'datos->texto' => 'Segunda fila ajustada',
        ]);
    }

    public function test_role_navigation_endpoints_do_not_mix_coordinator_and_teacher_privileges(): void
    {
        $this->actingAsTeacher()->get(route('convocations.index'))->assertForbidden();
        $this->actingAsCoordinator()->get(route('syllabi.index'))->assertForbidden();
    }

    public function test_expired_teacher_assignment_revokes_record_access(): void
    {
        $syllabus = $this->openConvocationAndGetSyllabus();
        TeacherAssignment::query()->update(['vigente_hasta' => now()->subMinute()]);

        $this->actingAsTeacher()->get(route('syllabi.show', $syllabus))->assertForbidden();
    }

    private function createPreparedConvocation(string $groupingMode): Convocation
    {
        [$template, $source] = $this->publishedConfiguration();
        $periodId = CourseOffering::query()->firstOrFail()->periodo_academico_id;

        $this->actingAsCoordinator()->post(route('convocations.store'), [
            'name' => 'Convocatoria '.$groupingMode,
            'period_id' => $periodId,
            'template_version_id' => $template->id,
            'grouping_mode' => $groupingMode,
            'source_ids' => [$source->id],
            'start_date' => now()->subDay()->toIso8601String(),
            'draft_deadline' => now()->addMonth()->toIso8601String(),
        ])->assertRedirect();

        // Por nombre: dos convocatorias creadas en el mismo segundo empatan en
        // `created_at` y «la última» dejaría de ser la recién preparada.
        return Convocation::query()->where('nombre', 'Convocatoria '.$groupingMode)->firstOrFail();
    }

    /** @return array{TemplateVersion, AcademicSource} */
    private function publishedConfiguration(): array
    {
        $this->actingAsAdministrator()->post(route('admin.templates.store'), ['name' => 'Plantilla I-03']);
        $template = TemplateVersion::query()->latest('created_at')->firstOrFail();
        $this->actingAsAdministrator()->post(route('admin.templates.publish', $template));

        $this->actingAsCoordinator()->post(route('sources.store'), [
            'name' => 'Fuente I-03',
            'description' => 'Documento de apoyo del periodo.',
        ]);
        $source = AcademicSource::query()->latest('created_at')->firstOrFail();
        $this->actingAsCoordinator()->put(route('sources.content.update', $source), [
            'content' => "## Perfil base\n\nEvidencia académica autorizada.",
        ]);

        return [$template->fresh(), $source->fresh()];
    }

    private function openConvocationAndGetSyllabus(): Syllabus
    {
        $convocation = $this->createPreparedConvocation('per_offering');
        $this->actingAsCoordinator()->post(route('convocations.open', $convocation))->assertRedirect();

        return Syllabus::query()->firstOrFail();
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
