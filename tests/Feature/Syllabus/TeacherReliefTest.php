<?php

namespace Tests\Feature\Syllabus;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Support\CreatesSyllabusProcess;
use Tests\TestCase;

/**
 * I-39: relevar a un docente en todos sus paralelos de una vez. Los paralelos con sílabo
 * siguen las reglas del relevo por expediente; los que no tienen sílabo solo cambian de
 * manos. Con un sílabo en revisión no se mueve nada.
 */
class TeacherReliefTest extends TestCase
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
        $this->replacement = $this->createTeacher('suplente@silabos.test');
    }

    public function test_the_relief_moves_every_parallel_with_and_without_syllabus(): void
    {
        $syllabus = $this->openedSyllabus();
        // Un segundo paralelo del mismo docente, abierto después de la convocatoria: sin sílabo.
        $extra = $this->extraParallelFor($this->teacher);

        $this->relieve()->assertRedirect()->assertSessionHasNoErrors()
            ->assertSessionHas('success', 'Relevo aplicado en 2 paralelos; 1 sílabos pasaron al docente entrante.');

        $this->assertDatabaseHas('colaboradores_silabo', ['silabo_id' => $syllabus->id, 'usuario_id' => $this->replacement->id]);
        $this->assertDatabaseMissing('colaboradores_silabo', ['silabo_id' => $syllabus->id, 'usuario_id' => $this->teacher->id]);
        $this->assertSame(0, TeacherAssignment::query()->where('usuario_id', $this->teacher->id)->where('activo', true)->count());
        $this->assertDatabaseHas('asignaciones_docente', ['usuario_id' => $this->replacement->id, 'paralelo_id' => $extra->id, 'activo' => true, 'sustento_numero' => 'UEB-RECT-2026-0142-R']);
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'docente.relevo_global', 'recurso_id' => $this->teacher->id]);
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'silabo.docente_transferido', 'recurso_id' => $syllabus->id]);

        // Repetirlo ya no encuentra paralelos: se dice, no se duplica.
        $this->relieve()->assertSessionHasErrors('outgoing_user_id');
    }

    public function test_a_syllabus_under_review_blocks_the_whole_relief_and_names_the_subject(): void
    {
        $syllabus = $this->submittedSyllabus();
        $extra = $this->extraParallelFor($this->teacher);

        $this->relieve()->assertSessionHasErrors('outgoing_user_id');

        $this->assertDatabaseHas('colaboradores_silabo', ['silabo_id' => $syllabus->id, 'usuario_id' => $this->teacher->id]);
        $this->assertDatabaseHas('asignaciones_docente', ['usuario_id' => $this->teacher->id, 'paralelo_id' => $extra->id, 'activo' => true]);
        $this->assertSame(0, TeacherAssignment::query()->where('usuario_id', $this->replacement->id)->count());
    }

    public function test_the_replacement_must_teach_in_the_career_and_only_coordination_relieves(): void
    {
        $this->openedSyllabus();
        $outsider = User::query()->create(['nombre' => 'Docente ajeno', 'correo_electronico' => 'ajeno@silabos.test', 'contrasena' => 'Temporal-2026!', 'activo' => true]);

        $this->relieve($outsider->id)->assertSessionHasErrors('incoming_user_id');

        $this->actingAs($this->teacher)->withSession(['active_role_assignment_id' => $this->teacherContext->id])
            ->post(route('coordination.academic.teachers.relieve'), $this->payload())
            ->assertForbidden();
    }

    public function test_archiving_a_teacher_with_syllabi_in_progress_is_refused_until_the_relief(): void
    {
        $this->validDraft();

        $this->actingAsAdministrator()
            ->from(route('admin.users.index'))
            ->patch(route('admin.users.update', $this->teacher), [
                'nombre' => $this->teacher->nombre,
                'correo_electronico' => $this->teacher->correo_electronico,
                'active' => 0,
            ])
            ->assertSessionHasErrors('active');
        $this->assertTrue($this->teacher->fresh()->activo);

        $this->relieve()->assertRedirect()->assertSessionHasNoErrors();

        // Sin sílabos en curso, archivar cierra lo que quedara vigente.
        $this->actingAsAdministrator()
            ->patch(route('admin.users.update', $this->teacher), [
                'nombre' => $this->teacher->nombre,
                'correo_electronico' => $this->teacher->correo_electronico,
                'active' => 0,
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertFalse($this->teacher->fresh()->activo);
    }

    private function relieve(?string $incomingId = null): TestResponse
    {
        return $this->actingAsCoordinator()->post(route('coordination.academic.teachers.relieve'), $this->payload($incomingId));
    }

    /** @return array<string, string> */
    private function payload(?string $incomingId = null): array
    {
        return [
            'outgoing_user_id' => $this->teacher->id,
            'incoming_user_id' => $incomingId ?? $this->replacement->id,
            'backing_type' => 'accion_personal',
            'backing_number' => 'UEB-RECT-2026-0142-R',
            'backing_date' => now()->subDay()->toDateString(),
            'idempotency_key' => (string) Str::uuid(),
        ];
    }

    private function extraParallelFor(User $teacher): Parallel
    {
        $offering = CourseOffering::query()->firstOrFail();
        $parallel = Parallel::query()->create(['oferta_academica_id' => $offering->id, 'codigo' => 'Z', 'activo' => true]);
        TeacherAssignment::query()->create([
            'usuario_id' => $teacher->id,
            'paralelo_id' => $parallel->id,
            'vigente_desde' => now()->subMonth(),
            'activo' => true,
        ]);

        return $parallel;
    }

    private function createTeacher(string $email): User
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $user = User::query()->create(['nombre' => 'Docente Suplente', 'correo_electronico' => $email, 'contrasena' => 'Temporal-2026!', 'activo' => true]);
        RoleAssignment::query()->create([
            'usuario_id' => $user->id,
            'rol_id' => Role::query()->where('codigo', RoleCode::Teacher->value)->firstOrFail()->id,
            'carrera_id' => $career->id,
            'activo' => true,
        ]);

        return $user;
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
        $this->actingAsCoordinator()->post(route('convocations.open', $convocation))->assertRedirect();

        return Syllabus::query()->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function validFieldPayload(FieldDefinition $field, int $lockVersion): array
    {
        $optionValues = collect($field->opciones ?? [])->map(fn (mixed $option): string => is_array($option) ? (string) ($option['value'] ?? 'opcion') : (string) $option)->filter()->values();

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
        $this->actingAsCoordinator()->post(route('sources.store'), ['nombre' => 'Fuente relevo', 'description' => 'Documento de apoyo del periodo.']);
        $source = AcademicSource::query()->latest('creado_en')->firstOrFail();
        $this->actingAsCoordinator()->put(route('sources.content.update', $source), ['content' => "## Perfil base\n\nEvidencia académica autorizada."]);

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
