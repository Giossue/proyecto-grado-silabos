<?php

namespace Tests\Feature\Academic;

use App\Models\User;
use App\Modules\Academic\Domain\StudyModality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AcademicStructureTest extends TestCase
{
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    private User $coordinator;

    private RoleAssignment $coordinatorContext;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
        $this->coordinatorContext = $this->coordinator->roleAssignments()->firstOrFail();
    }

    public function test_curricular_structure_belongs_directly_to_a_career(): void
    {
        $career = Career::query()->firstOrFail();
        $subject = Subject::query()->firstOrFail();

        $this->assertFalse(Schema::hasTable('mallas'));
        $this->assertTrue(Schema::hasColumn('carreras', 'codigo_malla'));
        $this->assertTrue(Schema::hasColumn('carreras', 'cantidad_ciclos_malla'));
        $this->assertTrue(Schema::hasColumn('asignaturas', 'carrera_id'));
        $this->assertTrue(Schema::hasColumn('silabos', 'carrera_id'));
        $this->assertFalse(Schema::hasColumn('asignaturas', 'malla_id'));
        $this->assertFalse(Schema::hasColumn('silabos', 'malla_id'));
        $this->assertFalse(Schema::hasColumn('paralelos', 'paralelo_activo'));
        $this->assertSame($career->id, $subject->carrera_id);
        $this->assertSame('MALLA-SW-2024', $career->codigo_malla);
        $this->assertSame(8, $career->cantidad_ciclos_malla);
    }

    public function test_career_requires_an_existing_faculty_and_curricular_structure_data(): void
    {
        $this->expectException(QueryException::class);

        Career::query()->create([
            'facultad_id' => (string) Str::uuid(),
            'codigo_carrera' => 'CARR-SIN-FACULTAD',
            'nombre' => 'Carrera sin facultad',
            'codigo_malla' => 'PLAN-SIN-FACULTAD',
            'cantidad_ciclos_malla' => 8,
            'activo' => true,
        ]);
    }

    public function test_coordinator_opens_their_career_curricular_structure(): void
    {
        $career = Career::query()->findOrFail($this->coordinatorContext->carrera_id);

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.index'))
            ->assertRedirect(route('coordination.academic.curricula.show', $career->id));

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.show', $career->id))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/CurriculumBuilder')
                ->where('career.id', $career->id)
                ->where('curriculum.id', $career->id)
                ->where('curriculum.code', $career->codigo_malla)
                ->where('curriculum.cycle_count', $career->cantidad_ciclos_malla)
                ->has('subjects', 1));
    }

    public function test_administrator_creates_a_career_with_its_fixed_curricular_structure(): void
    {
        $faculty = Faculty::query()->firstOrFail();
        $campus = Campus::query()->firstOrFail();

        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'carrera'), [
                'faculty_id' => $faculty->id,
                'campus_id' => $campus->id,
                'modality' => StudyModality::Hibrida->value,
                'code' => 'CARR-DEMO',
                'nombre' => 'Carrera de demostración',
                'curriculum_code' => 'PLAN-DEMO-2026',
                'cycle_count' => 9,
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('carreras', [
            'codigo_carrera' => 'CARR-DEMO',
            'codigo_malla' => 'PLAN-DEMO-2026',
            'cantidad_ciclos_malla' => 9,
        ]);
    }

    public function test_administrator_cannot_create_a_career_without_curricular_code_or_cycle_count(): void
    {
        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'carrera'), [
                'faculty_id' => Faculty::query()->firstOrFail()->id,
                'campus_id' => Campus::query()->firstOrFail()->id,
                'modality' => StudyModality::Presencial->value,
                'code' => 'CARR-INCOMPLETA',
                'nombre' => 'Carrera incompleta',
            ])
            ->assertSessionHasErrors(['curriculum_code', 'cycle_count']);
    }

    public function test_coordinator_configures_own_career_structure_and_creates_subjects_directly_in_it(): void
    {
        $career = Career::query()->findOrFail($this->coordinatorContext->carrera_id);

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.curricula.configuration.update', $career->id), [
                'code' => 'PLAN-SW-2027',
                'cycle_count' => 10,
            ])
            ->assertRedirect();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'asignatura'), [
                'code' => 'SW-701',
                'nombre' => 'Arquitectura Empresarial',
                'cycle' => 7,
                'organization_unit' => 'Unidad profesional',
                'horas_ac' => 48,
                'horas_pae' => 32,
                'horas_aa' => 64,
                'creditos' => 4,
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('carreras', [
            'id' => $career->id,
            'codigo_malla' => 'PLAN-SW-2027',
            'cantidad_ciclos_malla' => 10,
        ]);
        $this->assertDatabaseHas('asignaturas', [
            'carrera_id' => $career->id,
            'codigo_asignatura' => 'SW-701',
            'ciclo_asignatura' => 7,
            'total_horas_asignatura' => 144,
        ]);
    }

    public function test_coordinator_cannot_access_another_careers_curricular_structure_or_subjects(): void
    {
        $otherCareer = $this->createCareer('OTRA');

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.show', $otherCareer->id))
            ->assertNotFound();

        $otherSubject = Subject::query()->create([
            'carrera_id' => $otherCareer->id,
            'codigo_asignatura' => 'OTR-101',
            'nombre' => 'Materia ajena',
            'ciclo' => 1,
            'activo' => true,
        ]);
        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.status.update', [
                'entity' => 'asignatura',
                'record' => $otherSubject->id,
            ]), ['active' => false])
            ->assertNotFound();
    }

    public function test_scheduled_subjects_keep_their_career_scope_after_curricula_removal(): void
    {
        $scheduledSubject = ScheduledSubject::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.scheduled-subjects.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/ScheduledSubjects')
                ->where('scheduledSubjects.0.subject_code', $scheduledSubject->subject->codigo_asignatura));
    }

    private function createCareer(string $code): Career
    {
        $faculty = Faculty::query()->create([
            'codigo_facultad' => "FAC-{$code}",
            'nombre' => "Facultad {$code}",
            'activo' => true,
        ]);

        return Career::query()->create([
            'facultad_id' => $faculty->id,
            'campus_id' => Campus::query()->firstOrFail()->id,
            'modalidad' => StudyModality::Presencial,
            'codigo_carrera' => $code,
            'nombre' => "Carrera {$code}",
            'codigo_malla' => "PLAN-{$code}",
            'cantidad_ciclos_malla' => 8,
            'activo' => true,
        ]);
    }

    private function actingAsAdministrator(): static
    {
        $this->actingAs($this->administrator)
            ->withSession(['active_role_assignment_id' => $this->administratorContext->id]);

        return $this;
    }

    private function actingAsCoordinator(): static
    {
        $this->actingAs($this->coordinator)
            ->withSession(['active_role_assignment_id' => $this->coordinatorContext->id]);

        return $this;
    }
}
