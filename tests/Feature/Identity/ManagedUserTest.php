<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ManagedUserTest extends TestCase
{
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);
        $this->administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
    }

    public function test_administrator_can_list_and_filter_managed_users(): void
    {
        $this->actingAsAdministrator()
            ->get(route('admin.users.index', ['status' => 'all', 'q' => 'Docente']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Users/Index')
                ->has('users.data', 1)
                ->where('users.data.0.correo_electronico', 'docente@silabos.test')
                // Las cuentas sembradas ya tienen contraseña propia; una recién creada
                // no, y la lista tiene que distinguirlas.
                ->where('users.data.0.pending_first_login', false)
                ->where('filters.q', 'Docente')
                ->where('filters.status', null));
    }

    public function test_administrator_enters_without_selecting_its_only_role(): void
    {
        $this->actingAs($this->administrator)
            ->get(route('admin.users.index'))
            ->assertOk();
    }

    public function test_administration_is_denied_without_the_administrator_role(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();

        $this->actingAs($teacher)
            ->get(route('admin.users.index'))
            ->assertForbidden();
    }

    public function test_administrator_sees_complete_role_history_for_a_user(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $existing = $teacher->roleAssignments()->firstOrFail();
        $archived = $existing->replicate();
        $archived->id = null;
        $archived->activo = false;
        $archived->save();

        $this->actingAsAdministrator()
            ->get(route('admin.users.show', $teacher))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Users/Show')
                ->where('managedUser.correo_electronico', 'docente@silabos.test')
                ->has('managedUser.assignments', 2)
                ->where('managedUser.assignments.0.effective', true)
                ->where('managedUser.assignments.1.effective', false));
    }

    public function test_the_list_filters_by_role_career_and_state(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();

        // Por rol: solo quien lo tenga vigente.
        $this->actingAsAdministrator()
            ->get(route('admin.users.index', ['role' => RoleCode::Coordinator->value]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->has('users.data', 1)
                ->where('users.data.0.correo_electronico', 'coordinador@silabos.test')
                ->where('filters.role', RoleCode::Coordinator->value));

        // Por carrera: la administración no cuelga de ninguna, así que queda fuera.
        $this->actingAsAdministrator()
            ->get(route('admin.users.index', ['career' => $career->id]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('users.data', 2));

        // «Sin estrenar» es distinto de «activo»: las cuentas sembradas ya se usaron.
        $this->actingAsAdministrator()
            ->get(route('admin.users.index', ['status' => 'pending']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('users.data', 0));

        $this->actingAsAdministrator()
            ->post(route('admin.users.store'), [
                'nombre' => 'Docente Sin Estrenar',
                'correo_electronico' => 'sin.estrenar@silabos.test',
                'password' => 'Temporal-2026!',
                'role_code' => RoleCode::Teacher->value,
                'career_id' => $career->id,
            ])->assertRedirect();

        $this->actingAsAdministrator()
            ->get(route('admin.users.index', ['status' => 'pending']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->has('users.data', 1)
                ->where('users.data.0.correo_electronico', 'sin.estrenar@silabos.test'));

        // Y deja de contarse entre las activas, que es lo que dice su insignia.
        $this->actingAsAdministrator()
            ->get(route('admin.users.index', ['status' => 'active']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('users.data', 3));
    }

    public function test_the_list_separates_the_role_from_its_career(): void
    {
        $this->actingAsAdministrator()
            ->get(route('admin.users.index', ['q' => 'Administrador']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('users.data.0.roles.0.name', 'Administrador')
                // La administración gobierna el sistema entero: su rol no tiene carrera.
                ->where('users.data.0.careers.0', null));
    }

    public function test_teacher_cannot_access_user_management_even_with_a_valid_context(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $teacherContext = $teacher->roleAssignments()->firstOrFail();

        $this->actingAs($teacher)
            ->withSession(['active_role_assignment_id' => $teacherContext->id])
            ->get(route('admin.users.index'))
            ->assertForbidden();
    }

    public function test_administrator_creates_user_with_scoped_role_and_audit_event(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();

        $this->actingAsAdministrator()
            ->post(route('admin.users.store'), [
                'nombre' => 'Nueva Docente',
                'correo_electronico' => 'nueva.docente@silabos.test',
                'password' => 'Temporal-2026!',
                'role_code' => RoleCode::Teacher->value,
                'career_id' => $career->id,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $created = User::query()->where('correo_electronico', 'nueva.docente@silabos.test')->firstOrFail();
        $teacherRole = Role::query()->where('codigo', RoleCode::Teacher->value)->firstOrFail();

        $this->assertDatabaseHas('asignaciones_rol', [
            'usuario_id' => $created->id,
            'rol_id' => $teacherRole->id,
            'carrera_id' => $career->id,
            'activo' => true,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'actor_usuario_id' => $this->administrator->id,
            'asignacion_rol_id' => $this->administratorContext->id,
            'accion' => 'usuario.creado',
            'recurso_id' => $created->id,
            'resultado' => 'exito',
        ]);
    }

    public function test_scoped_role_requires_an_active_career(): void
    {
        $this->actingAsAdministrator()
            ->post(route('admin.users.store'), [
                'nombre' => 'Docente sin carrera',
                'correo_electronico' => 'sin.carrera@silabos.test',
                'password' => 'Temporal-2026!',
                'role_code' => RoleCode::Teacher->value,
            ])
            ->assertSessionHasErrors('career_id');

        $this->assertDatabaseMissing('usuarios', ['correo_electronico' => 'sin.carrera@silabos.test']);
    }

    public function test_granting_a_coordination_opens_its_mandate(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();

        // Con la carrera ya coordinada, la concesión se rechaza y lo dice.
        $this->actingAsAdministrator()
            ->post(route('admin.users.roles.store', $teacher), [
                'role_code' => RoleCode::Coordinator->value,
                'career_id' => $career->id,
            ])
            ->assertSessionHasErrors('role_code');

        $this->actingAsAdministrator()
            ->patch(route('admin.users.status.update', $this->coordinatorHolder()), ['active' => false])
            ->assertRedirect();

        // Al retirarse quien la ejercía, el nombramiento anterior queda cerrado.
        $this->assertDatabaseHas('asignaciones_coordinador', [
            'usuario_id' => $this->coordinatorHolder()->id,
            'activo' => false,
        ]);

        $this->actingAsAdministrator()
            ->post(route('admin.users.roles.store', $teacher), [
                'role_code' => RoleCode::Coordinator->value,
                'career_id' => $career->id,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        // El rol por sí solo no basta: sin nombramiento no se puede activar.
        $this->assertDatabaseHas('asignaciones_coordinador', [
            'usuario_id' => $teacher->id,
            'carrera_id' => $career->id,
            'activo' => true,
        ]);
    }

    private function coordinatorHolder(): User
    {
        return User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
    }

    public function test_administrator_assigns_an_additional_role_without_overwriting_history(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $previousAssignmentId = $teacher->roleAssignments()->firstOrFail()->id;

        // Conceder la coordinación abre el nombramiento, y la base no admite dos vigentes
        // en la misma carrera: primero se retira a quien la ejerce.
        $this->actingAsAdministrator()
            ->patch(route('admin.users.status.update', $this->coordinatorHolder()), ['active' => false])
            ->assertRedirect();

        $this->actingAsAdministrator()
            ->post(route('admin.users.roles.store', $teacher), [
                'role_code' => RoleCode::Coordinator->value,
                'career_id' => $career->id,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $coordinatorRole = Role::query()->where('codigo', RoleCode::Coordinator->value)->firstOrFail();
        $this->assertDatabaseHas('asignaciones_rol', ['id' => $previousAssignmentId, 'activo' => true]);
        $this->assertDatabaseHas('asignaciones_rol', [
            'usuario_id' => $teacher->id,
            'rol_id' => $coordinatorRole->id,
            'carrera_id' => $career->id,
            'activo' => true,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'usuario.rol_asignado',
            'recurso_id' => $teacher->id,
        ]);
    }

    public function test_administrator_can_assign_the_same_coordinator_to_another_career(): void
    {
        $coordinator = $this->coordinatorHolder();
        $originalAssignment = $coordinator->roleAssignments()->firstOrFail();
        $secondCareer = Career::query()->create([
            'facultad_id' => Career::query()->firstOrFail()->facultad_id,
            'codigo_institucional' => 'CARR-SEGUNDA-COORDINACION',
            'nombre' => 'Segunda carrera coordinada',
            'activo' => true,
        ]);

        $this->actingAsAdministrator()
            ->post(route('admin.users.roles.store', $coordinator), [
                'role_code' => RoleCode::Coordinator->value,
                'career_id' => $secondCareer->id,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertDatabaseHas('asignaciones_rol', [
            'id' => $originalAssignment->id,
            'activo' => true,
        ]);
        $this->assertDatabaseHas('asignaciones_rol', [
            'usuario_id' => $coordinator->id,
            'carrera_id' => $secondCareer->id,
            'activo' => true,
        ]);
        $this->assertDatabaseHas('asignaciones_coordinador', [
            'usuario_id' => $coordinator->id,
            'carrera_id' => $secondCareer->id,
            'activo' => true,
        ]);
        $this->assertCount(2, $coordinator->fresh()->roleAssignments);
    }

    public function test_deactivating_user_revokes_sessions_but_preserves_roles_and_audits(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $roleAssignmentId = $teacher->roleAssignments()->firstOrFail()->id;
        DB::table('sesiones')->insert([
            'id' => 'teacher-session-to-revoke',
            'user_id' => $teacher->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Feature test',
            'payload' => 'synthetic-session-payload',
            'last_activity' => now()->getTimestamp(),
        ]);

        $this->actingAsAdministrator()
            ->patch(route('admin.users.status.update', $teacher), ['active' => false])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertDatabaseHas('usuarios', ['id' => $teacher->id, 'activo' => false]);
        $this->assertDatabaseMissing('sesiones', ['id' => 'teacher-session-to-revoke']);
        $this->assertDatabaseHas('asignaciones_rol', ['id' => $roleAssignmentId]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'usuario.desactivado',
            'recurso_id' => $teacher->id,
            'resultado' => 'exito',
        ]);
    }

    public function test_administrator_cannot_deactivate_own_account(): void
    {
        $this->actingAsAdministrator()
            ->patch(route('admin.users.status.update', $this->administrator), ['active' => false])
            ->assertForbidden();

        $this->assertTrue($this->administrator->fresh()->activo);
    }

    public function test_postgresql_rejects_duplicate_active_role_assignments(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $existing = $teacher->roleAssignments()->firstOrFail();

        $this->expectException(QueryException::class);

        RoleAssignment::query()->create([
            'usuario_id' => $teacher->id,
            'rol_id' => $existing->rol_id,
            'carrera_id' => $existing->carrera_id,
            'activo' => true,
        ]);
    }

    private function actingAsAdministrator(): static
    {
        $this->actingAs($this->administrator)
            ->withSession(['active_role_assignment_id' => $this->administratorContext->id]);

        return $this;
    }
}
