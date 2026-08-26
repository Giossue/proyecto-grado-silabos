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
        $this->administrator = User::query()->where('email', 'admin@silabos.test')->firstOrFail();
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
                ->where('users.data.0.email', 'docente@silabos.test')
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
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();

        $this->actingAs($teacher)
            ->get(route('admin.users.index'))
            ->assertForbidden();
    }

    public function test_administrator_sees_complete_role_history_for_a_user(): void
    {
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $existing = $teacher->roleAssignments()->firstOrFail();
        $expired = $existing->replicate();
        $expired->id = null;
        $expired->vigente_desde = now()->subYears(3);
        $expired->vigente_hasta = now()->subYears(2);
        $expired->save();

        $this->actingAsAdministrator()
            ->get(route('admin.users.show', $teacher))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Users/Show')
                ->where('managedUser.email', 'docente@silabos.test')
                ->has('managedUser.assignments', 2)
                ->where('managedUser.assignments.0.effective', true)
                ->where('managedUser.assignments.1.effective', false));
    }

    public function test_teacher_cannot_access_user_management_even_with_a_valid_context(): void
    {
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
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
                'name' => 'Nueva Docente',
                'email' => 'nueva.docente@silabos.test',
                'password' => 'Temporal-2026!',
                'role_code' => RoleCode::Teacher->value,
                'career_id' => $career->id,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $created = User::query()->where('email', 'nueva.docente@silabos.test')->firstOrFail();
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
            'accion' => 'user.created',
            'recurso_id' => $created->id,
            'resultado' => 'success',
        ]);
    }

    public function test_scoped_role_requires_an_active_career(): void
    {
        $this->actingAsAdministrator()
            ->post(route('admin.users.store'), [
                'name' => 'Docente sin carrera',
                'email' => 'sin.carrera@silabos.test',
                'password' => 'Temporal-2026!',
                'role_code' => RoleCode::Teacher->value,
            ])
            ->assertSessionHasErrors('career_id');

        $this->assertDatabaseMissing('usuarios', ['email' => 'sin.carrera@silabos.test']);
    }

    public function test_administrator_assigns_an_additional_role_without_overwriting_history(): void
    {
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $previousAssignmentId = $teacher->roleAssignments()->firstOrFail()->id;

        $this->actingAsAdministrator()
            ->post(route('admin.users.roles.store', $teacher), [
                'role_code' => RoleCode::Coordinator->value,
                'career_id' => $career->id,
                'valid_from' => now()->toDateString(),
                'valid_until' => now()->addYear()->toDateString(),
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
            'accion' => 'user.role_assigned',
            'recurso_id' => $teacher->id,
        ]);
    }

    public function test_deactivating_user_revokes_sessions_but_preserves_roles_and_audits(): void
    {
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $roleAssignmentId = $teacher->roleAssignments()->firstOrFail()->id;
        DB::table('sessions')->insert([
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

        $this->assertDatabaseHas('usuarios', ['id' => $teacher->id, 'active' => false]);
        $this->assertDatabaseMissing('sessions', ['id' => 'teacher-session-to-revoke']);
        $this->assertDatabaseHas('asignaciones_rol', ['id' => $roleAssignmentId]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'user.deactivated',
            'recurso_id' => $teacher->id,
            'resultado' => 'success',
        ]);
    }

    public function test_administrator_cannot_deactivate_own_account(): void
    {
        $this->actingAsAdministrator()
            ->patch(route('admin.users.status.update', $this->administrator), ['active' => false])
            ->assertForbidden();

        $this->assertTrue($this->administrator->fresh()->active);
    }

    public function test_postgresql_rejects_overlapping_active_role_assignments(): void
    {
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $existing = $teacher->roleAssignments()->firstOrFail();

        $this->expectException(QueryException::class);

        RoleAssignment::query()->create([
            'usuario_id' => $teacher->id,
            'rol_id' => $existing->rol_id,
            'carrera_id' => $existing->carrera_id,
            'vigente_desde' => now()->subMonth(),
            'vigente_hasta' => now()->addMonth(),
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
