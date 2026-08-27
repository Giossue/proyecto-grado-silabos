<?php

namespace Tests\Feature\Academic;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Modality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Infrastructure\Persistence\Models\AuditEvent;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
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
        $this->administrator = User::query()->where('email', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('email', 'coordinador@silabos.test')->firstOrFail();
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
            'modalidades' => 'modalities',
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

    public function test_coordinator_sees_only_their_career_with_cycle_terminology(): void
    {
        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/Curricula')
                ->where('career.name', 'Software')
                ->where('subjects.0.code', 'SW-601')
                ->where('subjects.0.cycle', 6));

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.offerings.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/Offerings')
                ->has('offerings', 1)
                ->has('parallels', 1));

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.teacher-assignments.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Coordination/Academic/TeacherAssignments')
                ->has('teacherAssignments', 1)
                ->has('options.teacherUsers', 1));
    }

    public function test_role_boundaries_reject_governance_or_career_mutations_from_the_wrong_context(): void
    {
        $this->actingAsAdministrator()
            ->post(route('coordination.academic.store', 'curriculum'), [
                'code' => 'NO-ADMIN',
                'version_number' => 99,
            ])
            ->assertForbidden();

        $this->actingAsCoordinator()
            ->post(route('admin.academic.store', 'faculty'), [
                'name' => 'No autorizada',
            ])
            ->assertForbidden();

        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $teacherContext = $teacher->roleAssignments()->firstOrFail();

        $this->actingAs($teacher)
            ->withSession(['active_role_assignment_id' => $teacherContext->id])
            ->get(route('coordination.academic.curricula.index'))
            ->assertForbidden();

        $this->assertDatabaseMissing('facultades', ['nombre' => 'No autorizada']);
        $this->assertDatabaseMissing('versiones_malla', ['codigo' => 'NO-ADMIN']);
    }

    public function test_administrator_creates_faculty_career_and_assigns_a_matching_coordinator(): void
    {
        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'faculty'), [
                'code' => 'FAC-DEMO',
                'name' => 'Facultad de demostración',
            ])
            ->assertRedirect();
        $faculty = Faculty::query()->where('codigo_institucional', 'FAC-DEMO')->firstOrFail();

        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'career'), [
                'faculty_id' => $faculty->id,
                'code' => 'CARR-DEMO',
                'name' => 'Carrera de demostración',
            ])
            ->assertRedirect();
        $career = Career::query()->where('codigo_institucional', 'CARR-DEMO')->firstOrFail();
        $candidate = $this->userWithRole(RoleCode::Coordinator, $career);

        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'coordinator_assignment'), [
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
            'accion' => 'academic.coordinator_assignment.created',
            'tipo_recurso' => 'coordinator_assignment',
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
            ->post(route('admin.academic.store', 'coordinator_assignment'), [
                'user_id' => $acting->id,
                'career_id' => $career->id,
                'quality' => 'encargado',
                'valid_from' => now()->addDay()->toDateString(),
                'valid_until' => now()->addMonths(3)->toDateString(),
                'backing_type' => 'personnel_action',
                'backing_number' => 'UEB-RECT-2026-0311-R',
                'backing_date' => now()->subDay()->toDateString(),
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('asignaciones_coordinador', [
            'usuario_id' => $acting->id,
            'carrera_id' => $career->id,
            'calidad' => 'encargado',
            'sustento_tipo' => 'personnel_action',
            'sustento_numero' => 'UEB-RECT-2026-0311-R',
        ]);
    }

    public function test_an_acting_coordination_without_an_end_date_is_rejected(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $acting = $this->userWithRole(RoleCode::Coordinator, $career);

        // Un encargo sin fecha de fin sería una titularidad sin nombrar.
        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'coordinator_assignment'), [
                'user_id' => $acting->id,
                'career_id' => $career->id,
                'quality' => 'encargado',
                'valid_from' => now()->addDay()->toDateString(),
                'backing_type' => 'personnel_action',
                'backing_number' => 'UEB-RECT-2026-0312-R',
                'backing_date' => now()->subDay()->toDateString(),
            ])
            ->assertSessionHasErrors('valid_until');
    }

    public function test_coordinator_builds_and_publishes_a_curriculum_for_their_career(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'curriculum'), [
                'code' => 'MALLA-SW-2027',
                'version_number' => 2,
            ])
            ->assertRedirect();

        $curriculum = CurriculumVersion::query()->where('codigo', 'MALLA-SW-2027')->firstOrFail();
        $this->assertSame($career->id, $curriculum->carrera_id);
        $this->assertSame('draft', $curriculum->estado);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'subject'), [
                'curriculum_id' => $curriculum->id,
                'code' => 'SW-701',
                'name' => 'Arquitectura Empresarial',
                'cycle' => 7,
                'credits' => 4,
                'total_hours' => 160,
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('asignaturas', [
            'version_malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-701',
            'ciclo' => 7,
        ]);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.curricula.publish', $curriculum->id))
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertSame('published', $curriculum->fresh()->estado);
        $this->assertNotNull($curriculum->fresh()->publicado_en);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academic.curriculum.published',
            'recurso_id' => $curriculum->id,
        ]);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'subject'), [
                'curriculum_id' => $curriculum->id,
                'code' => 'SW-702',
                'name' => 'Cambio tardío',
            ])
            ->assertSessionHasErrors('curriculum_id');
    }

    public function test_coordinator_cannot_read_create_publish_or_archive_records_from_another_career(): void
    {
        $otherCareer = $this->createCareer('OTRA');
        $otherCurriculum = CurriculumVersion::query()->create([
            'carrera_id' => $otherCareer->id,
            'codigo' => 'MALLA-OTRA-1',
            'numero_version' => 1,
            'estado' => 'draft',
        ]);

        $this->actingAsCoordinator()
            ->get(route('coordination.academic.curricula.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where(
                'curricula',
                fn (Collection $curricula) => $curricula->doesntContain('code', 'MALLA-OTRA-1'),
            ));

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'subject'), [
                'curriculum_id' => $otherCurriculum->id,
                'code' => 'OTR-101',
                'name' => 'Materia ajena',
                'cycle' => 1,
            ])
            ->assertSessionHasErrors('curriculum_id');

        $otherSubject = Subject::query()->create([
            'version_malla_id' => $otherCurriculum->id,
            'codigo_institucional' => 'OTR-102',
            'nombre' => 'Materia histórica ajena',
            'ciclo' => 1,
            'activo' => true,
        ]);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.curricula.publish', $otherCurriculum->id))
            ->assertNotFound();

        $this->actingAsCoordinator()
            ->patch(route('coordination.academic.status.update', [
                'entity' => 'subject',
                'record' => $otherSubject->id,
            ]), ['active' => false])
            ->assertNotFound();

        $this->assertTrue($otherSubject->fresh()->activo);
    }

    public function test_duplicate_offering_is_reported_to_the_coordinator_as_a_validation_error(): void
    {
        $offering = CourseOffering::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'offering'), [
                'period_id' => $offering->periodo_academico_id,
                'subject_id' => $offering->asignatura_id,
                'campus_id' => $offering->campus_id,
                'modality_id' => $offering->modalidad_id,
            ])
            ->assertSessionHasErrors('subject_id');

        $this->assertSame(1, CourseOffering::query()->count());
    }

    public function test_coordinator_creates_an_offering_and_parallel_for_a_published_subject_in_their_career(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $curriculum = CurriculumVersion::query()->create([
            'carrera_id' => $career->id,
            'codigo' => 'MALLA-OFERTA-2027',
            'numero_version' => 2,
            'estado' => 'draft',
        ]);
        $subject = Subject::query()->create([
            'version_malla_id' => $curriculum->id,
            'codigo_institucional' => 'SW-750',
            'nombre' => 'Sistemas Distribuidos',
            'ciclo' => 7,
            'activo' => true,
        ]);
        $curriculum->update(['estado' => 'published', 'publicado_en' => now()]);
        $reference = CourseOffering::query()->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'offering'), [
                'period_id' => $reference->periodo_academico_id,
                'subject_id' => $subject->id,
                'campus_id' => $reference->campus_id,
                'modality_id' => $reference->modalidad_id,
            ])
            ->assertRedirect();
        $offering = CourseOffering::query()->where('asignatura_id', $subject->id)->firstOrFail();

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'parallel'), [
                'offering_id' => $offering->id,
                'code' => 'A',
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('paralelos', [
            'oferta_academica_id' => $offering->id,
            'codigo' => 'A',
            'activo' => true,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'academic.parallel.created',
            'tipo_recurso' => 'parallel',
        ]);
    }

    public function test_coordinator_assigns_a_teacher_to_a_parallel_in_their_career(): void
    {
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $offering = CourseOffering::query()->firstOrFail();
        $parallel = Parallel::query()->create([
            'oferta_academica_id' => $offering->id,
            'codigo' => 'B',
            'activo' => true,
        ]);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'teacher_assignment'), [
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
            'accion' => 'academic.teacher_assignment.created',
            'tipo_recurso' => 'teacher_assignment',
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
            ->assertDontSee($otherTeacher->email);

        $this->actingAsCoordinator()
            ->post(route('coordination.academic.store', 'teacher_assignment'), [
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
            ->where('accion', 'academic.campus.status_changed')
            ->where('recurso_id', $campus->id)
            ->count());
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
        $modality = Modality::query()->where('codigo', 'presencial')->firstOrFail();
        $period = AcademicPeriod::query()->firstOrFail();

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'faculty', 'record' => $faculty->id]), [
                'code' => 'FICAYA-ACT',
                'name' => 'Facultad de Ingeniería actualizada',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'career', 'record' => $career->id]), [
                'faculty_id' => $destinationFaculty->id,
                'code' => 'SOFTWARE-ACT',
                'name' => 'Ingeniería de Software',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'campus', 'record' => $campus->id]), [
                'code' => 'MATRIZ-ACT',
                'name' => 'Campus Central',
            ])
            ->assertRedirect();

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'modality', 'record' => $modality->id]), [
                'code' => 'presencial-act',
                'name' => 'Presencial actualizada',
            ])
            ->assertRedirect();

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'period', 'record' => $period->id]), [
                'code' => '2026-ACT',
                'name' => 'Periodo actualizado',
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
        $this->assertDatabaseHas('modalidades', [
            'id' => $modality->id,
            'codigo' => 'presencial-act',
            'nombre' => 'Presencial actualizada',
        ]);
        $this->assertDatabaseHas('periodos_academicos', [
            'id' => $period->id,
            'codigo' => '2026-ACT',
            'nombre' => 'Periodo actualizado',
            'fecha_inicio' => '2026-10-01',
            'fecha_fin' => '2027-02-28',
        ]);

        $this->assertSame(5, AuditEvent::query()
            ->whereIn('accion', [
                'academic.faculty.updated',
                'academic.career.updated',
                'academic.campus.updated',
                'academic.modality.updated',
                'academic.period.updated',
            ])
            ->count());

        $careerAudit = AuditEvent::query()
            ->where('accion', 'academic.career.updated')
            ->firstOrFail();
        $this->assertSame('Software', $careerAudit->metadatos['before_name'] ?? null);
        $this->assertSame('Ingeniería de Software', $careerAudit->metadatos['after_name'] ?? null);
        $this->assertSame('Facultad de Ingeniería actualizada', $careerAudit->metadatos['before_faculty'] ?? null);
        $this->assertSame('Facultad de destino', $careerAudit->metadatos['after_faculty'] ?? null);

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'career', 'record' => $career->id]), [
                'faculty_id' => $destinationFaculty->id,
                'code' => 'SOFTWARE-ACT',
                'name' => 'Ingeniería de Software',
            ])
            ->assertRedirect();
        $this->assertSame(1, AuditEvent::query()
            ->where('accion', 'academic.career.updated')
            ->where('recurso_id', $career->id)
            ->count());

        $this->actingAsAdministrator()
            ->get(route('admin.audit.index', ['action' => 'academic.career.updated']))
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
            ->patch(route('admin.academic.update', ['entity' => 'faculty', 'record' => $faculty->id]), [
                'code' => $archivedFaculty->codigo_institucional,
                'name' => 'Código repetido',
            ])
            ->assertSessionHasErrors('code');

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'career', 'record' => $career->id]), [
                'faculty_id' => $archivedFaculty->id,
                'code' => $career->codigo_institucional,
                'name' => $career->nombre,
            ])
            ->assertSessionHasErrors('faculty_id');

        $this->actingAsAdministrator()
            ->patch(route('admin.academic.update', ['entity' => 'period', 'record' => $period->id]), [
                'code' => $period->codigo,
                'name' => $period->nombre,
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
            ->patch(route('admin.academic.update', ['entity' => 'faculty', 'record' => $faculty->id]), [
                'code' => 'NO-AUTORIZADO',
                'name' => 'Cambio no autorizado',
            ])
            ->assertForbidden();

        $this->assertSame('FICAYA', $faculty->fresh()->codigo_institucional);
        $this->assertDatabaseMissing('eventos_auditoria', [
            'accion' => 'academic.faculty.updated',
            'recurso_id' => $faculty->id,
        ]);
    }

    public function test_postgresql_rejects_overlapping_teacher_assignments_for_same_parallel(): void
    {
        $existing = TeacherAssignment::query()->firstOrFail();

        $this->expectException(QueryException::class);
        TeacherAssignment::query()->create([
            'usuario_id' => $existing->usuario_id,
            'paralelo_id' => $existing->paralelo_id,
            'vigente_desde' => now()->subMonth(),
            'vigente_hasta' => now()->addMonth(),
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
