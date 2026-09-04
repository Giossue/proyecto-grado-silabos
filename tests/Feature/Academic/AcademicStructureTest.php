<?php

namespace Tests\Feature\Academic;

use App\Models\User;
use App\Modules\Academic\Domain\StudyModality;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumFieldDefinition;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectFieldValue;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectRequirement;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Infrastructure\Persistence\Models\AuditEvent;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\MakesTransparentPng;
use Tests\TestCase;

class AcademicStructureTest extends TestCase
{
    use MakesTransparentPng;
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    private User $coordinator;

    private RoleAssignment $coordinatorContext;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');

        $this->seed(DatabaseSeeder::class);
        $this->administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
        $this->coordinatorContext = $this->coordinator->roleAssignments()->firstOrFail();
    }

    public function test_administrator_sees_global_governance_split_by_catalog(): void
    {
        $faculty = Faculty::query()
            ->where('codigo_institucional', 'FICAYA')
            ->firstOrFail();

        $this->actingAsAdministrator()
            ->get(route('admin.academic.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Academic/Index')
                ->where('section', 'faculties')
                ->where('catalogs.faculties.0.id', $faculty->id)
                ->where('catalogs.careers.0.name', 'Software')
                ->where('catalogs.careers.0.faculty_id', $faculty->id)
                ->where('catalogs.campuses.0.nombre', 'Campus Matriz')
                ->has('options.faculties', 1)
                ->missing('subjects'));

        foreach ([
            'facultades' => 'faculties',
            'carreras' => 'careers',
            'campus' => 'campuses',
            'periodos-academicos' => 'academic-periods',
        ] as $routeSection => $pageSection) {
            $this->actingAsAdministrator()
                ->get(route('admin.academic.index', $routeSection))
                ->assertOk()
                ->assertInertia(fn (Assert $page) => $page
                    ->component('Admin/Academic/Index')
                    ->where('section', $pageSection));
        }

        $this->actingAsAdministrator()
            ->get('/admin/facultades-carreras')
            ->assertRedirect('/admin/estructura-academica/facultades');

        // La coordinación dejó de tener pantalla propia: se concede con el rol desde
        // «Usuarios y roles», que es donde vive quien la ejerce.
        $this->actingAsAdministrator()
            ->get('/admin/coordinaciones')
            ->assertNotFound();
    }

    public function test_postgresql_preserves_the_normalized_faculty_career_hierarchy(): void
    {
        $faculty = Faculty::query()->firstOrFail();
        $career = Career::query()->firstOrFail();

        $this->assertTrue(Schema::hasTable('facultades'));
        $this->assertTrue(Schema::hasTable('carreras'));
        $this->assertTrue(Schema::hasTable('campus'));
        $this->assertTrue(Schema::hasColumn('carreras', 'facultad_id'));
        $this->assertFalse(Schema::hasColumn('campus', 'facultad_id'));
        $this->assertSame($faculty->id, $career->facultad_id);
        $this->assertTrue($faculty->careers()->whereKey($career->id)->exists());

        $this->expectException(QueryException::class);

        Career::query()->create([
            'facultad_id' => (string) Str::uuid(),
            'codigo_institucional' => 'CARR-SIN-FACULTAD',
            'nombre' => 'Carrera sin facultad',
            'activo' => true,
        ]);
    }

    public function test_coordinator_sees_only_their_career_and_subjects_live_inside_each_curriculum(): void
    {
        $curriculum = Curriculum::query()->firstOrFail();
        $offering = CourseOffering::query()
            ->with(['academicPeriod', 'subject', 'parallels'])
            ->firstOrFail();
        $parallel = $offering->parallels->firstOrFail();

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.index'))
            ->assertRedirect(route('coordination.academic.curricula.show', $curriculum->id));

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.show', $curriculum->id))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/CurriculumBuilder')
                ->where('career.name', 'Software')
                ->where('curriculum.id', $curriculum->id)
                ->has('subjects', 1));

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.subjects.index'))
            ->assertRedirect('/coordinacion/malla');

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.offerings.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/Offerings')
                ->has('offerings', 1)
                ->where('offerings.0.subject_code', $offering->subject->codigo_institucional)
                ->where('offerings.0.subject_name', $offering->subject->nombre)
                ->where('offerings.0.period_starts_on', $offering->academicPeriod->fecha_inicio->toDateString())
                ->where('offerings.0.period_ends_on', $offering->academicPeriod->fecha_fin->toDateString()));

        $this->assertFalse(Route::has('coordination.academic.parallels.index'));

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.teacher-assignments.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/TeacherAssignments')
                ->has('teacherAssignments', 1)
                ->has('options.teacherUsers', 1)
                ->has('options.parallels', 1)
                ->where(
                    'options.parallels.0.label',
                    "{$offering->subject->nombre} · {$offering->academicPeriod->fecha_inicio->format('d/m/Y')} · {$offering->academicPeriod->codigo} · Paralelo {$parallel->codigo}",
                )
                ->where('options.teacherUsers.0.name', 'DOCENTE DEMO')
                ->where('options.teacherUsers.0.email', 'docente@silabos.test'));
    }

    public function test_role_boundaries_reject_governance_or_career_mutations_from_the_wrong_context(): void
    {
        $this->actingAsAdministrator()
            ->post(route('coordination.academic.store', 'malla'), [
                'code' => 'NO-ADMIN',
            ])
            ->assertForbidden();

        $this->actingAsCoordinator()
            ->post(route('admin.academic.store', 'facultad'), [
                'nombre' => 'No autorizada',
            ])
            ->assertForbidden();

        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $teacherContext = $teacher->roleAssignments()->firstOrFail();

        $this->actingAs($teacher)
            ->withSession(['active_role_assignment_id' => $teacherContext->id])
            ->get(route('coordination.academic.curricula.index'))
            ->assertForbidden();

        $this->assertDatabaseMissing('facultades', ['nombre' => 'No autorizada']);
        $this->assertDatabaseMissing('mallas', ['codigo' => 'NO-ADMIN']);
    }

    public function test_administrator_creates_faculty_career_and_assigns_a_matching_coordinator(): void
    {
        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'facultad'), [
                'code' => 'FAC-DEMO',
                'nombre' => 'Facultad de demostración',
                'logo' => $this->transparentPng(600, 180),
            ])
            ->assertRedirect();
        $faculty = Faculty::query()->where('codigo_institucional', 'FAC-DEMO')->firstOrFail();

        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'carrera'), [
                'faculty_id' => $faculty->id,
                'modality' => 'presencial',
                'campus_id' => Campus::query()->firstOrFail()->id,
                'code' => 'CARR-DEMO',
                'nombre' => 'Carrera de demostración',
            ])
            ->assertRedirect();
        $career = Career::query()->where('codigo_institucional', 'CARR-DEMO')->firstOrFail();
        $candidate = $this->userWithRole(RoleCode::Coordinator, $career);

        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'asignacion_coordinador'), [
                'user_id' => $candidate->id,
                'career_id' => $career->id,
                'valid_from' => now()->toDateString(),
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('asignaciones_coordinador', [
            'usuario_id' => $candidate->id,
            'carrera_id' => $career->id,
            'activo' => true,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.asignacion_coordinador.creacion',
            'tipo_recurso' => 'asignacion_coordinador',
        ]);
        // Sin declararlo, una coordinación es titular: es el caso normal.
        $this->assertDatabaseHas('asignaciones_coordinador', [
            'usuario_id' => $candidate->id,
            'calidad' => 'titular',
        ]);
    }

    public function test_an_acting_coordination_records_its_duration_and_the_act_that_backs_it(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $acting = $this->userWithRole(RoleCode::Coordinator, $career);

        // La coordinación titular vigente se cierra primero: la base impide dos activas
        // superpuestas en la misma carrera.
        CoordinatorAssignment::query()
            ->where('carrera_id', $career->id)
            ->whereNull('vigente_hasta')
            ->update(['vigente_hasta' => now(), 'activo' => false]);

        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'asignacion_coordinador'), [
                'user_id' => $acting->id,
                'career_id' => $career->id,
                'quality' => 'encargado',
                'valid_from' => now()->addDay()->toDateString(),
                'valid_until' => now()->addMonths(3)->toDateString(),
                'backing_type' => 'accion_personal',
                'backing_number' => 'UEB-RECT-2026-0311-R',
                'backing_date' => now()->subDay()->toDateString(),
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('asignaciones_coordinador', [
            'usuario_id' => $acting->id,
            'carrera_id' => $career->id,
            'calidad' => 'encargado',
            'sustento_tipo' => 'accion_personal',
            'sustento_numero' => 'UEB-RECT-2026-0311-R',
        ]);
    }

    public function test_an_acting_coordination_without_an_end_date_is_rejected(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $acting = $this->userWithRole(RoleCode::Coordinator, $career);

        // Un encargo sin fecha de fin sería una titularidad sin nombrar.
        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'asignacion_coordinador'), [
                'user_id' => $acting->id,
                'career_id' => $career->id,
                'quality' => 'encargado',
                'valid_from' => now()->addDay()->toDateString(),
                'backing_type' => 'accion_personal',
                'backing_number' => 'UEB-RECT-2026-0312-R',
                'backing_date' => now()->subDay()->toDateString(),
            ])
            ->assertSessionHasErrors('valid_until');
    }

    public function test_each_career_can_create_only_one_current_curriculum_without_a_visible_version(): void
    {
        $career = $this->createCareer('MALLA-UNICA');
        $coordinator = $this->userWithRole(RoleCode::Coordinator, $career);
        $role = $coordinator->roleAssignments()->firstOrFail();
        CoordinatorAssignment::query()->create([
            'usuario_id' => $coordinator->id,
            'carrera_id' => $career->id,
            'vigente_desde' => now()->subDay(),
            'activo' => true,
        ]);

        $this->actingAs($coordinator)
            ->withSession(['active_role_assignment_id' => $role->id])
            ->get(route('coordination.academic.curricula.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/Curricula')
                ->where('career.id', $career->id)
                ->has('options'));

        $this->actingAs($coordinator)
            ->withSession(['active_role_assignment_id' => $role->id])
            ->post(route('coordination.academic.store', 'malla'), [
                'code' => 'MALLA-UNICA-2027',
            ])
            ->assertRedirect();

        $curriculum = Curriculum::query()->where('codigo', 'MALLA-UNICA-2027')->firstOrFail();
        $this->assertSame($career->id, $curriculum->carrera_id);
        $this->assertSame('activa', $curriculum->estado);

        $this->actingAs($coordinator)
            ->withSession(['active_role_assignment_id' => $role->id])
            ->post(route('coordination.academic.store', 'asignatura'), [
                'curriculum_id' => $curriculum->id,
                'code' => 'SW-701',
                'nombre' => 'Arquitectura Empresarial',
                'cycle' => 7,
                'organization_unit' => 'Unidad profesional',
                'horas_ac' => 48,
                'horas_pae' => 32,
                'horas_aa' => 64,
                'creditos' => 4,
                'horas_totales' => 999,
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('asignaturas', [
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-701',
            'ciclo' => 7,
            'orden_en_ciclo' => 0,
            'horas_totales' => 144,
        ]);

        $this->actingAs($coordinator)
            ->withSession(['active_role_assignment_id' => $role->id])
            ->post(route('coordination.academic.store', 'asignatura'), [
                'curriculum_id' => $curriculum->id,
                'code' => 'SW-702',
                'nombre' => 'Materia incompleta',
                'cycle' => 7,
            ])
            ->assertSessionHasErrors([
                'organization_unit',
                'horas_ac',
                'horas_pae',
                'horas_aa',
                'creditos',
            ]);

        $this->actingAs($coordinator)
            ->withSession(['active_role_assignment_id' => $role->id])
            ->post(route('coordination.academic.store', 'malla'), [
                'code' => 'MALLA-SEGUNDA',
            ])
            ->assertSessionHasErrors('curriculum');
    }

    public function test_coordinator_opens_the_curriculum_builder_with_configurable_fields(): void
    {
        $curriculum = Curriculum::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.show', $curriculum->id))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/CurriculumBuilder')
                ->where('career.name', 'Software')
                ->where('curriculum.id', $curriculum->id)
                ->where('curriculum.cycle_count', 8)
                ->where('curriculum.active', true)
                ->where('curriculum.editable', true)
                ->has('fieldDefinitions', 5)
                ->where('fieldDefinitions.0.label', 'ACD')
                ->where('subjects.0.display_fields.0.label', 'ACD')
                ->where('subjects.0.display_fields.0.value', '64.00'));
    }

    public function test_coordinator_configures_the_current_curriculum_with_fields_layout_and_requirements(): void
    {
        $curriculum = Curriculum::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.curricula.configuration.update', $curriculum->id), [
                'code' => $curriculum->codigo,
                'cycle_count' => 10,
            ])
            ->assertRedirect();

        // Payload completo: los campos activos de la malla son obligatorios, así
        // que solo el ciclo fuera de rango debe rechazar la materia.
        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'asignatura'), [
                'curriculum_id' => $curriculum->id,
                'code' => 'FUERA-101',
                'nombre' => 'Materia fuera de rango',
                'cycle' => 11,
                'organization_unit' => 'Unidad profesional',
                'horas_ac' => 48,
                'horas_pae' => 32,
                'horas_aa' => 64,
                'creditos' => 3,
                'horas_totales' => 144,
            ])
            ->assertSessionHasErrors('cycle');

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.curricula.fields.store', $curriculum->id), [
                'key' => 'horas_laboratorio',
                'label' => 'LAB',
                'type' => 'entero',
                'system_key' => null,
                'position' => 6,
                'visible_on_card' => true,
                'totalizable' => true,
            ])
            ->assertRedirect();
        $field = CurriculumFieldDefinition::query()
            ->where('malla_id', $curriculum->id)
            ->where('clave', 'horas_laboratorio')
            ->firstOrFail();

        foreach ([
            ['code' => 'FLEX-101', 'nombre' => 'Fundamentos flexibles', 'cycle' => 1, 'position' => 0],
            ['code' => 'FLEX-201', 'nombre' => 'Proyecto flexible', 'cycle' => 2, 'position' => 1],
        ] as $subjectData) {
            $this->actingAsCoordinator()
                ->post(route('coordination.academic.store', 'asignatura'), [
                    'curriculum_id' => $curriculum->id,
                    ...$subjectData,
                    'organization_unit' => 'Unidad profesional',
                    'horas_ac' => 48,
                    'horas_pae' => 32,
                    'horas_aa' => 64,
                    'creditos' => 3,
                    'horas_totales' => 144,
                    'custom_values' => [$field->id => 24],
                ])
                ->assertRedirect();
        }
        $first = Subject::query()->where('codigo_institucional', 'FLEX-101')->firstOrFail();
        $second = Subject::query()->where('codigo_institucional', 'FLEX-201')->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.curricula.requirements.store', $curriculum->id), [
                'requirement_id' => $first->id,
                'subject_id' => $second->id,
                'type' => 'prerrequisito',
            ])
            ->assertRedirect();
        $this->actingAsCoordinator()
            ->post(route('coordination.academic.curricula.requirements.store', $curriculum->id), [
                'requirement_id' => $second->id,
                'subject_id' => $first->id,
                'type' => 'prerrequisito',
            ])
            ->assertSessionHasErrors('requirement_id');

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.curricula.layout.update', $curriculum->id), [
                'subject_id' => $second->id,
                'cycle' => 9,
                'position' => 3,
            ])
            ->assertRedirect();

        $this->assertSame(10, $curriculum->fresh()->numero_ciclos);
        $this->assertSame(9, $second->fresh()->ciclo);
        $this->assertSame(3, $second->fresh()->orden_en_ciclo);
        $this->assertSame('Unidad profesional', $second->fresh()->unidad_organizacion_curricular);
        $this->assertSame(2, SubjectFieldValue::query()->where('definicion_campo_id', $field->id)->count());
        $this->assertSame(1, SubjectRequirement::query()->where('asignatura_id', $second->id)->count());
        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.show', $curriculum->id))
            ->assertInertia(fn (Assert $page) => $page
                ->where('fieldTotals.5.label', 'LAB')
                ->where('fieldTotals.5.value', 48));
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.requisito_asignatura.creacion',
            'tipo_recurso' => 'requisito_asignatura',
        ]);

        $this->actingAsCoordinator()
            ->delete(route('coordination.academic.curricula.fields.destroy', [
                'curriculum' => $curriculum->id,
                'field' => $field->id,
            ]))
            ->assertRedirect();
        $this->assertFalse($field->fresh()->activo);
        $this->assertSame(2, SubjectFieldValue::query()->where('definicion_campo_id', $field->id)->count());
    }

    public function test_builder_edits_the_current_curriculum_but_rejects_out_of_scope_mutations(): void
    {
        $current = Curriculum::query()->firstOrFail();
        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.curricula.configuration.update', $current->id), [
                'code' => 'MALLA-BUILDER-RENOMBRADA',
                'cycle_count' => 9,
            ])
            ->assertRedirect();
        $this->assertSame(9, $current->fresh()->numero_ciclos);

        $otherCareer = $this->createCareer('BUILDER-OTRA');
        $otherCurriculum = Curriculum::query()->create([
            'carrera_id' => $otherCareer->id,
            'codigo' => 'MALLA-BUILDER-AJENA',
            'numero_ciclos' => 6,
            'estado' => 'activa',
        ]);

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.show', $otherCurriculum->id))
            ->assertNotFound();
        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.curricula.configuration.update', $otherCurriculum->id), [
                'code' => $otherCurriculum->codigo,
                'cycle_count' => 7,
            ])
            ->assertNotFound();
    }

    public function test_coordinator_edits_the_current_curriculum_and_its_subject_with_audit(): void
    {
        $curriculum = Curriculum::query()->firstOrFail();
        $subject = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-710',
            'nombre' => 'Materia provisional',
            'ciclo' => 7,
            'creditos' => 3,
            'horas_totales' => 120,
            'activo' => true,
        ]);

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', [
                'entity' => 'malla',
                'record' => $curriculum->id,
            ]), [
                'code' => 'MALLA-SW-EDITADA',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', [
                'entity' => 'asignatura',
                'record' => $subject->id,
            ]), [
                'code' => 'SW-711',
                'nombre' => 'Materia corregida',
                'cycle' => 8,
                'organization_unit' => 'Unidad profesional',
                'horas_ac' => 48,
                'horas_pae' => 32,
                'horas_aa' => 64,
                'creditos' => 4,
                'horas_totales' => 999,
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('mallas', [
            'id' => $curriculum->id,
            'codigo' => 'MALLA-SW-EDITADA',
        ]);
        $this->assertDatabaseHas('asignaturas', [
            'id' => $subject->id,
            'codigo_institucional' => 'SW-711',
            'nombre' => 'Materia corregida',
            'ciclo' => 8,
            'horas_totales' => 144,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.malla.actualizacion',
            'recurso_id' => $curriculum->id,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.asignatura.actualizacion',
            'recurso_id' => $subject->id,
        ]);
    }

    public function test_coordinator_edits_unused_offering_parallel_and_teacher_assignment(): void
    {
        $offering = CourseOffering::query()->firstOrFail();
        $parallel = Parallel::query()->firstOrFail();
        $assignment = TeacherAssignment::query()->firstOrFail();
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $period = AcademicPeriod::query()->create([
            'codigo' => '2027-2028',
            'nombre' => 'Periodo académico 2027-2028',
            'fecha_inicio' => '2027-05-01',
            'fecha_fin' => '2027-09-30',
            'activo' => true,
        ]);

        // El campus no se edita en la oferta: lo fija la carrera (I-36).
        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', [
                'entity' => 'oferta',
                'record' => $offering->id,
            ]), [
                'period_id' => $period->id,
                'subject_id' => $offering->asignatura_id,
            ])
            ->assertRedirect();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', [
                'entity' => 'paralelo',
                'record' => $parallel->id,
            ]), [
                'offering_id' => $offering->id,
                'code' => 'B',
                'shift' => 'vespertina',
            ])
            ->assertRedirect();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', [
                'entity' => 'asignacion_docente',
                'record' => $assignment->id,
            ]), [
                'user_id' => $teacher->id,
                'parallel_id' => $parallel->id,
            ])
            ->assertRedirect();

        $this->assertSame($period->id, $offering->fresh()->periodo_academico_id);
        $this->assertSame(Career::query()->findOrFail($this->coordinatorContext->carrera_id)->campus_id, $offering->fresh()->campus_id);
        $this->assertSame('B', $parallel->fresh()->codigo);
        $this->assertSame('vespertina', $parallel->fresh()->jornada);
        $this->assertSame($teacher->id, $assignment->fresh()->usuario_id);
        $this->assertSame(2, AuditEvent::query()
            ->whereIn('accion', [
                'academico.oferta.actualizacion',
                'academico.paralelo.actualizacion',
                'academico.asignacion_docente.actualizacion',
            ])
            ->count());
    }

    public function test_current_curriculum_and_subject_remain_editable(): void
    {
        $curriculum = Curriculum::query()->firstOrFail();
        $subject = Subject::query()->where('malla_id', $curriculum->id)->firstOrFail();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', [
                'entity' => 'malla',
                'record' => $curriculum->id,
            ]), [
                'code' => 'MALLA-REESCRITA',
            ])
            ->assertRedirect();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', [
                'entity' => 'asignatura',
                'record' => $subject->id,
            ]), [
                'code' => $subject->codigo_institucional,
                'nombre' => 'Nombre reescrito',
                'cycle' => $subject->ciclo,
                'organization_unit' => 'Unidad profesional',
                'horas_ac' => $subject->horas_ac,
                'horas_pae' => $subject->horas_pae ?? 0,
                'horas_aa' => $subject->horas_aa,
                'creditos' => $subject->creditos,
                'horas_totales' => $subject->horas_totales,
            ])
            ->assertRedirect();

        $this->assertSame('MALLA-REESCRITA', $curriculum->fresh()->codigo);
        $this->assertSame('Nombre reescrito', $subject->fresh()->nombre);
    }

    public function test_coordinator_disables_and_reactivates_the_curriculum_and_inactive_state_blocks_new_offerings(): void
    {
        $curriculum = Curriculum::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.status.update', [
                'entity' => 'malla',
                'record' => $curriculum->id,
            ]), ['active' => false])
            ->assertRedirect();
        $this->assertSame('inactiva', $curriculum->fresh()->estado);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'asignatura'), [
                'curriculum_id' => $curriculum->id,
                'code' => 'SW-INACTIVA',
                'nombre' => 'Materia editable sin proceso',
                'cycle' => 1,
                'organization_unit' => 'Unidad básica',
                'horas_ac' => 48,
                'horas_pae' => 32,
                'horas_aa' => 64,
                'creditos' => 3,
            ])
            ->assertRedirect();
        $subject = Subject::query()->where('codigo_institucional', 'SW-INACTIVA')->firstOrFail();
        $reference = CourseOffering::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'oferta'), [
                'period_id' => $reference->periodo_academico_id,
                'subject_id' => $subject->id,
                'campus_id' => $reference->campus_id,
            ])
            ->assertSessionHasErrors('subject_id');

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.status.update', [
                'entity' => 'malla',
                'record' => $curriculum->id,
            ]), ['active' => true])
            ->assertRedirect();
        $this->assertSame('activa', $curriculum->fresh()->estado);
    }

    public function test_coordinator_deletes_an_offering_with_its_parallels_and_teacher_assignments_without_syllabi(): void
    {
        $offering = CourseOffering::query()->firstOrFail();
        $parallelIds = Parallel::query()
            ->where('oferta_academica_id', $offering->id)
            ->pluck('id');

        $this->actingAsCoordinator()
            ->delete(route('coordination.academic.offerings.destroy', $offering))
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertDatabaseMissing('ofertas_academicas', ['id' => $offering->id]);
        $this->assertSame(0, Parallel::query()->whereIn('id', $parallelIds)->count());
        $this->assertSame(0, TeacherAssignment::query()->whereIn('paralelo_id', $parallelIds)->count());
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.oferta.eliminacion',
            'recurso_id' => $offering->id,
        ]);
    }

    public function test_curriculum_delete_is_protected_by_dependencies_and_removes_an_unused_curriculum(): void
    {
        $career = $this->createCareer('MALLA-BORRABLE');
        $coordinator = $this->userWithRole(RoleCode::Coordinator, $career);
        $role = $coordinator->roleAssignments()->firstOrFail();
        CoordinatorAssignment::query()->create([
            'usuario_id' => $coordinator->id,
            'carrera_id' => $career->id,
            'vigente_desde' => now()->subDay(),
            'activo' => true,
        ]);
        $curriculum = Curriculum::query()->create([
            'carrera_id' => $career->id,
            'codigo' => 'MALLA-BORRABLE',
            'estado' => 'activa',
        ]);

        $this->actingAs($coordinator)
            ->withSession(['active_role_assignment_id' => $role->id])
            ->delete(route('coordination.academic.curricula.destroy', $curriculum->id))
            ->assertRedirect(route('coordination.academic.curricula.index'));

        $this->assertDatabaseMissing('mallas', ['id' => $curriculum->id]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.malla.eliminacion',
            'recurso_id' => $curriculum->id,
        ]);

        $used = Curriculum::query()->where('carrera_id', $this->coordinatorContext->carrera_id)->firstOrFail();
        $this->actingAsCoordinator()
            ->delete(route('coordination.academic.curricula.destroy', $used->id))
            ->assertSessionHasErrors('curriculum');
        $this->assertDatabaseHas('mallas', ['id' => $used->id]);
    }

    public function test_subject_delete_is_protected_by_dependencies_and_removes_an_unused_subject(): void
    {
        $curriculum = Curriculum::query()
            ->where('carrera_id', $this->coordinatorContext->carrera_id)
            ->firstOrFail();
        $subject = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-901',
            'nombre' => 'Materia sin historial',
            'ciclo' => 9,
            'creditos' => 3,
            'horas_totales' => 120,
            'activo' => true,
        ]);
        $requirementSubject = Subject::query()
            ->where('malla_id', $curriculum->id)
            ->whereKeyNot($subject->id)
            ->firstOrFail();
        $requirement = SubjectRequirement::query()->create([
            'asignatura_id' => $subject->id,
            'requisito_id' => $requirementSubject->id,
            'tipo' => 'prerrequisito',
        ]);

        $this->actingAsCoordinator()
            ->delete(route('coordination.academic.curricula.subjects.destroy', [
                'curriculum' => $curriculum->id,
                'subject' => $subject->id,
            ]))
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertDatabaseMissing('asignaturas', ['id' => $subject->id]);
        $this->assertDatabaseMissing('requisitos_asignatura', ['id' => $requirement->id]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.asignatura.eliminacion',
            'recurso_id' => $subject->id,
        ]);

        $usedSubject = CourseOffering::query()->firstOrFail()->subject()->firstOrFail();
        $this->actingAsCoordinator()
            ->delete(route('coordination.academic.curricula.subjects.destroy', [
                'curriculum' => $usedSubject->malla_id,
                'subject' => $usedSubject->id,
            ]))
            ->assertSessionHasErrors('subject');
        $this->assertDatabaseHas('asignaturas', ['id' => $usedSubject->id]);
    }

    public function test_coordinator_cannot_read_create_edit_or_archive_records_from_another_career(): void
    {
        $otherCareer = $this->createCareer('OTRA');
        $otherCurriculum = Curriculum::query()->create([
            'carrera_id' => $otherCareer->id,
            'codigo' => 'MALLA-OTRA-1',
            'estado' => 'activa',
        ]);

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.index'))
            ->assertRedirect(route(
                'coordination.academic.curricula.show',
                Curriculum::query()->where('carrera_id', $this->coordinatorContext->carrera_id)->valueOrFail('id'),
            ));

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'asignatura'), [
                'curriculum_id' => $otherCurriculum->id,
                'code' => 'OTR-101',
                'nombre' => 'Materia ajena',
                'cycle' => 1,
            ])
            ->assertSessionHasErrors('curriculum_id');

        $otherSubject = Subject::query()->create([
            'malla_id' => $otherCurriculum->id,
            'codigo_institucional' => 'OTR-102',
            'nombre' => 'Materia histórica ajena',
            'ciclo' => 1,
            'activo' => true,
        ]);

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.status.update', [
                'entity' => 'asignatura',
                'record' => $otherSubject->id,
            ]), ['active' => false])
            ->assertNotFound();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', [
                'entity' => 'malla',
                'record' => $otherCurriculum->id,
            ]), [
                'code' => 'MALLA-AJENA-EDITADA',
            ])
            ->assertForbidden();

        $this->assertTrue($otherSubject->fresh()->activo);
    }

    /** I-35/I-37: la modalidad la aprueba el CES por carrera; la oferta no la elige. */
    public function test_a_career_requires_its_approved_modality_and_offerings_inherit_it(): void
    {
        $faculty = Faculty::query()->firstOrFail();

        $this->actingAsAdministrator()
            ->from(route('admin.academic.index', 'carreras'))
            ->post(route('admin.academic.store', 'carrera'), [
                'faculty_id' => $faculty->id,
                'campus_id' => Campus::query()->firstOrFail()->id,
                'code' => 'SIN-MODA',
                'nombre' => 'Carrera sin modalidad',
            ])
            ->assertSessionHasErrors('modality');
        $this->actingAsAdministrator()
            ->from(route('admin.academic.index', 'carreras'))
            ->post(route('admin.academic.store', 'carrera'), [
                'faculty_id' => $faculty->id,
                'campus_id' => Campus::query()->firstOrFail()->id,
                'modality' => 'virtual',
                'code' => 'SIN-MODA',
                'nombre' => 'Carrera con modalidad inventada',
            ])
            ->assertSessionHasErrors('modality');
        $this->assertDatabaseMissing('carreras', ['codigo_institucional' => 'SIN-MODA']);

        $career = Career::query()->findOrFail($this->coordinatorContext->carrera_id);
        $curriculum = Curriculum::query()->active()->where('carrera_id', $career->id)->firstOrFail();
        $subject = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-MODA',
            'nombre' => 'Materia que hereda modalidad',
            'ciclo' => 2,
            'activo' => true,
        ]);
        $reference = CourseOffering::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'oferta'), [
                'period_id' => $reference->periodo_academico_id,
                'subject_id' => $subject->id,
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $offering = CourseOffering::query()->where('asignatura_id', $subject->id)->firstOrFail();
        $this->assertSame(StudyModality::Presencial, $offering->modalidad);

        // Sin modalidad en la carrera no hay de dónde heredar: se explica, no se adivina.
        $career->forceFill(['modalidad' => null])->save();
        $another = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-MODA-2',
            'nombre' => 'Materia sin modalidad heredable',
            'ciclo' => 2,
            'activo' => true,
        ]);
        $this->actingAsCoordinator()
            ->from(route('coordination.academic.offerings.index'))
            ->post(route('coordination.academic.store', 'oferta'), [
                'period_id' => $reference->periodo_academico_id,
                'subject_id' => $another->id,
            ])
            ->assertSessionHasErrors('subject_id');
    }

    /** I-37: una materia apartada de la base vuelve híbrida la carrera (RRA art. 74A) sin marcar nada. */
    public function test_a_subject_with_its_own_modality_makes_the_career_hybrid(): void
    {
        $career = Career::query()->findOrFail($this->coordinatorContext->carrera_id);
        $curriculum = Curriculum::query()->active()->where('carrera_id', $career->id)->firstOrFail();
        $payload = [
            'curriculum_id' => $curriculum->id,
            'code' => 'SW-ONL',
            'nombre' => 'Materia en línea de carrera presencial',
            'cycle' => 3,
            'organization_unit' => 'Unidad profesional',
            'horas_ac' => 32,
            'horas_pae' => 32,
            'horas_aa' => 32,
            'creditos' => 2,
        ];

        // Vacío = la de la carrera.
        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'asignatura'), [...$payload, 'modality' => ''])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $subject = Subject::query()->where('codigo_institucional', 'SW-ONL')->firstOrFail();
        $this->assertNull($subject->modalidad);
        $this->actingAsAdministrator()
            ->get(route('admin.academic.index', 'carreras'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('catalogs.careers.0.modality_label', 'Presencial')
                ->where('catalogs.careers.0.hybrid', false));

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.update', ['entity' => 'asignatura', 'record' => $subject->id]), [...$payload, 'modality' => 'en_linea'])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertSame(StudyModality::EnLinea, $subject->fresh()->modalidad);
        $this->actingAsAdministrator()
            ->get(route('admin.academic.index', 'carreras'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('catalogs.careers.0.modality', 'presencial')
                ->where('catalogs.careers.0.modality_label', 'Híbrida')
                ->where('catalogs.careers.0.hybrid', true));

        $reference = CourseOffering::query()->firstOrFail();
        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'oferta'), [
                'period_id' => $reference->periodo_academico_id,
                'subject_id' => $subject->id,
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertSame(StudyModality::EnLinea, CourseOffering::query()->where('asignatura_id', $subject->id)->firstOrFail()->modalidad);

        // Admin ve «Híbrida» y quiere «corregirla»: no puede pisar lo que decidió Coordinación.
        $this->actingAsAdministrator()
            ->from(route('admin.academic.index', 'carreras'))
            ->patch(route('admin.academic.update', ['entity' => 'carrera', 'record' => $career->id]), [
                'faculty_id' => $career->facultad_id,
                'modality' => 'en_linea',
                'campus_id' => $career->campus_id,
                'code' => $career->codigo_institucional,
                'nombre' => $career->nombre,
            ])
            ->assertSessionHasErrors('modality');
        $this->assertSame(StudyModality::Presencial, $career->fresh()->modalidad);
        // Dejarla igual sigue siendo válido (renombrar, mover de facultad).
        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'carrera', 'record' => $career->id]), [
                'faculty_id' => $career->facultad_id,
                'modality' => 'presencial',
                'campus_id' => $career->campus_id,
                'code' => $career->codigo_institucional,
                'nombre' => 'Software renombrada',
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
    }

    /** I-36: preparar solo acepta materias que aún no tienen oferta en el período. */
    public function test_coordinator_prepares_only_subjects_without_an_offering_in_the_period(): void
    {
        $career = Career::query()->findOrFail($this->coordinatorContext->carrera_id);
        $curriculum = Curriculum::query()->active()->where('carrera_id', $career->id)->firstOrFail();
        $reference = CourseOffering::query()->firstOrFail();
        $subjects = [];
        foreach (['SW-P1', 'SW-P2'] as $index => $code) {
            $subjects[] = Subject::query()->create([
                'malla_id' => $curriculum->id,
                'codigo_institucional' => $code,
                'nombre' => "Materia preparada {$index}",
                'ciclo' => 5,
                'orden_en_ciclo' => $index,
                'activo' => true,
            ]);
        }
        $subjectCount = Subject::query()->where('malla_id', $curriculum->id)->where('activo', true)->count();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.period.prepare'), [
                'period_id' => $reference->periodo_academico_id,
                'subjects' => collect($subjects)->map(fn (Subject $subject): array => [
                    'id' => $subject->id,
                    'parallels' => [['code' => 'A']],
                ])->all(),
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors()
            ->assertSessionHas('success', 'Período preparado: 2 ofertas y 2 paralelos nuevos para 2 materias.');

        $offerings = CourseOffering::query()->where('periodo_academico_id', $reference->periodo_academico_id)->get();
        $this->assertCount($subjectCount, $offerings);
        $this->assertTrue($offerings->every(fn (CourseOffering $offering): bool => $offering->campus_id === $career->campus_id
            && $offering->modalidad === $career->modalidad));
        $this->assertSame($subjectCount, Parallel::query()->whereIn('oferta_academica_id', $offerings->pluck('id'))->count());
        $this->assertSame(2, AuditEvent::query()->where('accion', 'academico.paralelo.creacion')->count());

        // No se vuelve a preparar una materia ya ofertada.
        $this->actingAsCoordinator()
            ->post(route('coordination.academic.period.prepare'), [
                'period_id' => $reference->periodo_academico_id,
                'subjects' => collect($subjects)->map(fn (Subject $subject): array => [
                    'id' => $subject->id,
                    'parallels' => [['code' => 'B']],
                ])->all(),
            ])
            ->assertRedirect()
            ->assertSessionHasErrors('subjects');
        $this->assertSame($subjectCount, CourseOffering::query()->where('periodo_academico_id', $reference->periodo_academico_id)->count());

        // Sin campus en la carrera no hay de dónde heredar.
        $career->forceFill(['campus_id' => null])->save();
        $subjectWithoutCampus = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-SIN-CAMPUS',
            'nombre' => 'Materia sin campus',
            'ciclo' => 5,
            'orden_en_ciclo' => 3,
            'activo' => true,
        ]);
        $this->actingAsCoordinator()
            ->from(route('coordination.academic.offerings.index'))
            ->post(route('coordination.academic.period.prepare'), [
                'period_id' => $reference->periodo_academico_id,
                'subjects' => [[
                    'id' => $subjectWithoutCampus->id,
                    'parallels' => [['code' => 'A']],
                ]],
            ])
            ->assertSessionHasErrors('subject_id');
    }

    public function test_coordinator_prepares_only_selected_subjects_with_each_requested_parallel_shift(): void
    {
        $career = Career::query()->findOrFail($this->coordinatorContext->carrera_id);
        $curriculum = Curriculum::query()->active()->where('carrera_id', $career->id)->firstOrFail();
        $reference = CourseOffering::query()->firstOrFail();
        $subject = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-PREPARACION-SELECTIVA',
            'nombre' => 'Materia preparada selectivamente',
            'ciclo' => 6,
            'orden_en_ciclo' => 1,
            'activo' => true,
        ]);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.period.prepare'), [
                'period_id' => $reference->periodo_academico_id,
                'subjects' => [[
                    'id' => $subject->id,
                    'parallels' => [
                        ['code' => 'B', 'shift' => 'matutina'],
                        ['code' => 'C', 'shift' => 'vespertina'],
                    ],
                ]],
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors()
            ->assertSessionHas('success', 'Período preparado: 1 oferta y 2 paralelos nuevos para 1 materia.');

        $offering = CourseOffering::query()
            ->where('periodo_academico_id', $reference->periodo_academico_id)
            ->where('asignatura_id', $subject->id)
            ->firstOrFail();
        $this->assertDatabaseHas('paralelos', [
            'oferta_academica_id' => $offering->id,
            'codigo' => 'B',
            'jornada' => 'matutina',
        ]);
        $this->assertDatabaseHas('paralelos', [
            'oferta_academica_id' => $offering->id,
            'codigo' => 'C',
            'jornada' => 'vespertina',
        ]);
        $this->assertDatabaseMissing('paralelos', [
            'oferta_academica_id' => $offering->id,
            'codigo' => 'A',
        ]);
    }

    public function test_duplicate_offering_is_reported_to_the_coordinator_as_a_validation_error(): void
    {
        $offering = CourseOffering::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'oferta'), [
                'period_id' => $offering->periodo_academico_id,
                'subject_id' => $offering->asignatura_id,
                'campus_id' => $offering->campus_id,
            ])
            ->assertSessionHasErrors('subject_id');

        $this->assertSame(1, CourseOffering::query()->count());
    }

    public function test_coordinator_creates_an_offering_and_parallel_for_a_subject_in_the_active_curriculum(): void
    {
        $curriculum = Curriculum::query()->active()->firstOrFail();
        $subject = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-750',
            'nombre' => 'Sistemas Distribuidos',
            'ciclo' => 7,
            'activo' => true,
        ]);
        $reference = CourseOffering::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'oferta'), [
                'period_id' => $reference->periodo_academico_id,
                'subject_id' => $subject->id,
                'campus_id' => $reference->campus_id,
            ])
            ->assertRedirect();
        $offering = CourseOffering::query()->where('asignatura_id', $subject->id)->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'paralelo'), [
                'offering_id' => $offering->id,
                'code' => 'A',
                'shift' => 'matutina',
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('paralelos', [
            'oferta_academica_id' => $offering->id,
            'codigo' => 'A',
            'jornada' => 'matutina',
            'activo' => true,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.paralelo.creacion',
            'tipo_recurso' => 'paralelo',
        ]);
    }

    public function test_coordinator_creates_multiple_parallels_atomically_for_one_offering(): void
    {
        $offering = CourseOffering::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.parallels.store'), [
                'offering_id' => $offering->id,
                'codes' => ['B', 'C'],
                'shift' => 'vespertina',
            ])
            ->assertRedirect()
            ->assertSessionHas('success', '2 paralelos creados dentro de su carrera.');

        foreach (['B', 'C'] as $code) {
            $this->assertDatabaseHas('paralelos', [
                'oferta_academica_id' => $offering->id,
                'codigo' => $code,
                'jornada' => 'vespertina',
                'activo' => true,
            ]);
        }
        $this->assertSame(2, AuditEvent::query()
            ->where('accion', 'academico.paralelo.creacion')
            ->where('metadatos->bulk', true)
            ->count());

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.parallels.store'), [
                'offering_id' => $offering->id,
                'codes' => ['C', 'D'],
                'shift' => 'nocturna',
            ])
            ->assertSessionHasErrors('codes');

        $this->assertDatabaseMissing('paralelos', [
            'oferta_academica_id' => $offering->id,
            'codigo' => 'D',
        ]);
    }

    public function test_coordinator_cannot_create_parallel_lot_for_an_offering_from_another_career(): void
    {
        $otherCareer = $this->createCareer('OTRA-PAR');
        $curriculum = Curriculum::query()->create([
            'carrera_id' => $otherCareer->id,
            'codigo' => 'MALLA-OTRA-PAR',
            'estado' => 'activa',
        ]);
        $subject = Subject::query()->create([
            'malla_id' => $curriculum->id,
            'codigo_institucional' => 'OTRA-PAR-101',
            'nombre' => 'Materia ajena',
            'ciclo' => 1,
            'activo' => true,
        ]);
        $offering = CourseOffering::query()->create([
            'periodo_academico_id' => AcademicPeriod::query()->firstOrFail()->id,
            'asignatura_id' => $subject->id,
            'campus_id' => Campus::query()->firstOrFail()->id,
            'modalidad' => StudyModality::Presencial,
            'activo' => true,
        ]);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.parallels.store'), [
                'offering_id' => $offering->id,
                'codes' => ['B'],
            ])
            ->assertSessionHasErrors('offering_id');

        $this->assertDatabaseMissing('paralelos', [
            'oferta_academica_id' => $offering->id,
            'codigo' => 'B',
        ]);
    }

    public function test_coordinator_assigns_a_teacher_to_a_parallel_in_their_career(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $offering = CourseOffering::query()->firstOrFail();
        $parallel = Parallel::query()->create([
            'oferta_academica_id' => $offering->id,
            'codigo' => 'B',
            'activo' => true,
        ]);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'asignacion_docente'), [
                'user_id' => $teacher->id,
                'parallel_id' => $parallel->id,
                'valid_from' => now()->toDateString(),
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('asignaciones_docente', [
            'usuario_id' => $teacher->id,
            'paralelo_id' => $parallel->id,
            'activo' => true,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.asignacion_docente.creacion',
            'tipo_recurso' => 'asignacion_docente',
        ]);
    }

    public function test_coordinator_cannot_assign_a_teacher_whose_role_belongs_to_another_career(): void
    {
        $otherCareer = $this->createCareer('DOC-OTRA');
        $otherTeacher = $this->userWithRole(RoleCode::Teacher, $otherCareer);
        $parallel = Parallel::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.teacher-assignments.index'))
            ->assertOk()
            ->assertDontSee($otherTeacher->correo_electronico);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'asignacion_docente'), [
                'user_id' => $otherTeacher->id,
                'parallel_id' => $parallel->id,
                'valid_from' => now()->toDateString(),
            ])
            ->assertSessionHasErrors('user_id');

        $this->assertDatabaseMissing('asignaciones_docente', [
            'usuario_id' => $otherTeacher->id,
            'paralelo_id' => $parallel->id,
        ]);
    }

    public function test_global_record_with_active_dependants_cannot_be_archived_by_administrator(): void
    {
        $campus = Campus::query()->where('codigo_institucional', 'MATRIZ')->firstOrFail();

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.status.update', [
                'entity' => 'campus',
                'record' => $campus->id,
            ]), ['active' => false])
            ->assertSessionHasErrors('record');

        $this->assertTrue($campus->fresh()->activo);
    }

    public function test_administrator_archives_and_reactivates_an_independent_catalog_record(): void
    {
        $campus = Campus::query()->create([
            'codigo_institucional' => 'CAMPUS-FLEX',
            'nombre' => 'Campus flexible',
            'activo' => true,
        ]);

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.status.update', [
                'entity' => 'campus',
                'record' => $campus->id,
            ]), ['active' => false])
            ->assertRedirect();

        $this->assertFalse($campus->fresh()->activo);

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.status.update', [
                'entity' => 'campus',
                'record' => $campus->id,
            ]), ['active' => true])
            ->assertRedirect();

        $this->assertTrue($campus->fresh()->activo);
        $this->assertSame(2, AuditEvent::query()
            ->where('accion', 'academico.campus.cambio_estado')
            ->where('recurso_id', $campus->id)
            ->count());
    }

    public function test_unreferenced_catalogs_parallels_and_teacher_assignments_are_deleted_instead_of_archived(): void
    {
        $campus = Campus::query()->create([
            'codigo_institucional' => 'CAMPUS-ELIMINABLE',
            'nombre' => 'Campus eliminable',
            'activo' => true,
        ]);
        $this->actingAsAdministrator()
            ->delete(route('admin.academic.destroy', ['entity' => 'campus', 'record' => $campus->id]))
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertDatabaseMissing('campus', ['id' => $campus->id]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academico.campus.eliminacion',
            'recurso_id' => $campus->id,
        ]);

        $parallel = Parallel::query()->firstOrFail();
        $assignment = TeacherAssignment::query()->where('paralelo_id', $parallel->id)->firstOrFail();
        $this->actingAsCoordinator()
            ->delete(route('coordination.academic.destroy', ['entity' => 'asignacion_docente', 'record' => $assignment->id]))
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertDatabaseMissing('asignaciones_docente', ['id' => $assignment->id]);

        $this->actingAsCoordinator()
            ->delete(route('coordination.academic.destroy', ['entity' => 'paralelo', 'record' => $parallel->id]))
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertDatabaseMissing('paralelos', ['id' => $parallel->id]);
    }

    public function test_administrator_edits_all_global_catalogs_with_audited_before_and_after_values(): void
    {
        $faculty = Faculty::query()->where('codigo_institucional', 'FICAYA')->firstOrFail();
        $destinationFaculty = Faculty::query()->create([
            'codigo_institucional' => 'FAC-DESTINO',
            'nombre' => 'Facultad de destino',
            'activo' => true,
        ]);
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $campus = Campus::query()->where('codigo_institucional', 'MATRIZ')->firstOrFail();
        $period = AcademicPeriod::query()->firstOrFail();

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'facultad', 'record' => $faculty->id]), [
                'code' => 'FICAYA-ACT',
                'nombre' => 'Facultad de Ingeniería actualizada',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'carrera', 'record' => $career->id]), [
                'faculty_id' => $destinationFaculty->id,
                'modality' => $career->modalidad->value,
                'campus_id' => $career->campus_id,
                'code' => 'SOFTWARE-ACT',
                'nombre' => 'Ingeniería de Software',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'campus', 'record' => $campus->id]), [
                'code' => 'MATRIZ-ACT',
                'nombre' => 'Campus Central',
            ])
            ->assertRedirect();

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'periodo', 'record' => $period->id]), [
                'code' => '2026-ACT',
                'nombre' => 'Periodo actualizado',
                'starts_on' => '2026-10-01',
                'ends_on' => '2027-02-28',
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('facultades', [
            'id' => $faculty->id,
            'codigo_institucional' => 'FICAYA-ACT',
            'nombre' => 'Facultad de Ingeniería actualizada',
        ]);
        $this->assertDatabaseHas('carreras', [
            'id' => $career->id,
            'facultad_id' => $destinationFaculty->id,
            'codigo_institucional' => 'SOFTWARE-ACT',
            'nombre' => 'Ingeniería de Software',
        ]);
        $this->assertDatabaseHas('campus', [
            'id' => $campus->id,
            'codigo_institucional' => 'MATRIZ-ACT',
            'nombre' => 'Campus Central',
        ]);
        $this->assertDatabaseHas('periodos_academicos', [
            'id' => $period->id,
            'codigo' => '2026-ACT',
            'nombre' => 'Periodo actualizado',
            'fecha_inicio' => '2026-10-01',
            'fecha_fin' => '2027-02-28',
        ]);

        $this->assertSame(4, AuditEvent::query()
            ->whereIn('accion', [
                'academico.facultad.actualizacion',
                'academico.carrera.actualizacion',
                'academico.campus.actualizacion',
                'academico.periodo.actualizacion',
            ])
            ->count());

        $careerAudit = AuditEvent::query()
            ->where('accion', 'academico.carrera.actualizacion')
            ->firstOrFail();
        $this->assertSame('Software', $careerAudit->metadatos['before_name'] ?? null);
        $this->assertSame('Ingeniería de Software', $careerAudit->metadatos['after_name'] ?? null);
        $this->assertSame('Facultad de Ingeniería actualizada', $careerAudit->metadatos['before_faculty'] ?? null);
        $this->assertSame('Facultad de destino', $careerAudit->metadatos['after_faculty'] ?? null);

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'carrera', 'record' => $career->id]), [
                'faculty_id' => $destinationFaculty->id,
                'modality' => $career->modalidad->value,
                'campus_id' => $career->campus_id,
                'code' => 'SOFTWARE-ACT',
                'nombre' => 'Ingeniería de Software',
            ])
            ->assertRedirect();
        $this->assertSame(1, AuditEvent::query()
            ->where('accion', 'academico.carrera.actualizacion')
            ->where('recurso_id', $career->id)
            ->count());

        $this->actingAsAdministrator()
            ->get(route('admin.audit.index', ['action' => 'academico.carrera.actualizacion']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Operations/Audit')
                ->where('events.data.0.action', 'Carrera actualizada')
                ->where('events.data.0.resource', 'Carrera')
                ->where(
                    'events.data.0.details',
                    fn (Collection $details) => $details->contains('label', 'Nombre anterior')
                        && $details->contains('label', 'Facultad nueva'),
                ));
    }

    public function test_catalog_updates_validate_unique_codes_dates_and_active_faculty_reassignment(): void
    {
        $faculty = Faculty::query()->where('codigo_institucional', 'FICAYA')->firstOrFail();
        $archivedFaculty = Faculty::query()->create([
            'codigo_institucional' => 'FAC-ARCHIVADA',
            'nombre' => 'Facultad archivada',
            'activo' => false,
        ]);
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $period = AcademicPeriod::query()->firstOrFail();

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'facultad', 'record' => $faculty->id]), [
                'code' => $archivedFaculty->codigo_institucional,
                'nombre' => 'Código repetido',
            ])
            ->assertSessionHasErrors('code');

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'carrera', 'record' => $career->id]), [
                'faculty_id' => $archivedFaculty->id,
                'modality' => $career->modalidad->value,
                'campus_id' => $career->campus_id,
                'code' => $career->codigo_institucional,
                'nombre' => $career->nombre,
            ])
            ->assertSessionHasErrors('faculty_id');

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'periodo', 'record' => $period->id]), [
                'code' => $period->codigo,
                'nombre' => $period->nombre,
                'starts_on' => '2027-02-01',
                'ends_on' => '2027-01-01',
            ])
            ->assertSessionHasErrors('ends_on');

        $this->assertSame('FICAYA', $faculty->fresh()->codigo_institucional);
        $this->assertNotSame($archivedFaculty->id, $career->fresh()->facultad_id);
    }

    public function test_non_administrator_cannot_edit_global_catalogs(): void
    {
        $faculty = Faculty::query()->where('codigo_institucional', 'FICAYA')->firstOrFail();

        $this->actingAsCoordinator()
            ->patch(route('admin.academic.update', ['entity' => 'facultad', 'record' => $faculty->id]), [
                'code' => 'NO-AUTORIZADO',
                'nombre' => 'Cambio no autorizado',
            ])
            ->assertForbidden();

        $this->assertSame('FICAYA', $faculty->fresh()->codigo_institucional);
        $this->assertDatabaseMissing('eventos_auditoria', [
            'accion' => 'academico.facultad.actualizacion',
            'recurso_id' => $faculty->id,
        ]);
    }

    public function test_postgresql_rejects_duplicate_teacher_assignments_for_same_parallel(): void
    {
        $existing = TeacherAssignment::query()->firstOrFail();

        $this->expectException(QueryException::class);
        TeacherAssignment::query()->create([
            'usuario_id' => $existing->usuario_id,
            'paralelo_id' => $existing->paralelo_id,
            'activo' => true,
        ]);
    }

    private function createCareer(string $code): Career
    {
        $faculty = Faculty::query()->create([
            'codigo_institucional' => "FAC-{$code}",
            'nombre' => "Facultad {$code}",
            'activo' => true,
        ]);

        return Career::query()->create([
            'facultad_id' => $faculty->id,
            'codigo_institucional' => $code,
            'nombre' => "Carrera {$code}",
            'activo' => true,
        ]);
    }

    private function userWithRole(RoleCode $roleCode, Career $career): User
    {
        $user = User::factory()->create();
        $role = Role::query()->where('codigo', $roleCode->value)->firstOrFail();

        RoleAssignment::query()->create([
            'usuario_id' => $user->id,
            'rol_id' => $role->id,
            'carrera_id' => $career->id,
            'vigente_desde' => now()->subDay(),
            'activo' => true,
        ]);

        return $user;
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
