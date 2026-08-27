<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Infrastructure\Persistence\Models\AuditEvent;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ActiveRoleTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_sees_only_effective_own_roles(): void
    {
        $this->seed(DatabaseSeeder::class);
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $vigente = $teacher->roleAssignments()->firstOrFail();
        $expired = $vigente->replicate();
        $expired->id = null;
        $expired->vigente_desde = now()->subYears(2);
        $expired->vigente_hasta = now()->subYear();
        $expired->save();
        // La pantalla solo aparece con varios roles entre los que decidir.
        $this->alsoCoordinates($teacher);

        $this->actingAs($teacher)
            ->get(route('role.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Role/Select')
                ->has('auth.roles', 2)
                ->where('auth.roles.0.role', 'teacher')
                ->where('auth.roles.0.career_name', 'Software'));
    }

    public function test_single_eligible_role_activates_without_asking(): void
    {
        $this->seed(DatabaseSeeder::class);
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $assignment = $teacher->roleAssignments()->firstOrFail();

        $this->actingAs($teacher)
            ->followingRedirects()
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('auth.active_role_id', $assignment->id));

        // Y la pantalla de selección deja de tener sentido.
        $this->actingAs($teacher)
            ->get(route('role.index'))
            ->assertRedirect(route('dashboard'));
    }

    public function test_several_eligible_roles_are_never_activated_on_their_own(): void
    {
        $this->seed(DatabaseSeeder::class);
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $this->alsoCoordinates($teacher);

        $this->actingAs($teacher)
            ->followingRedirects()
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('auth.active_role_id', null));
    }

    public function test_user_can_select_an_effective_context_and_action_is_audited(): void
    {
        $this->seed(DatabaseSeeder::class);
        $coordinator = User::query()->where('email', 'coordinador@silabos.test')->firstOrFail();
        $assignment = $coordinator->roleAssignments()->firstOrFail();

        $this->actingAs($coordinator)
            ->post(route('role.store'), ['role_assignment_id' => $assignment->id])
            ->assertRedirect(route('dashboard'))
            ->assertSessionHas('active_role_assignment_id', $assignment->id);

        $this->assertDatabaseHas('eventos_auditoria', [
            'actor_usuario_id' => $coordinator->id,
            'asignacion_rol_id' => $assignment->id,
            'accion' => 'active_role.selected',
            'resultado' => 'success',
        ]);
    }

    public function test_coordinator_role_requires_an_effective_academic_coordination(): void
    {
        $this->seed(DatabaseSeeder::class);
        $coordinator = User::query()->where('email', 'coordinador@silabos.test')->firstOrFail();
        $roleAssignment = $coordinator->roleAssignments()->firstOrFail();
        CoordinatorAssignment::query()
            ->where('usuario_id', $coordinator->id)
            ->update(['activo' => false]);

        $this->actingAs($coordinator)
            ->get(route('role.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Role/Select')
                ->has('auth.roles', 0)
                ->where('auth.active_role_id', null));

        $this->actingAs($coordinator)
            ->post(route('role.store'), ['role_assignment_id' => $roleAssignment->id])
            ->assertNotFound();

        $this->actingAs($coordinator)
            ->withSession(['active_role_assignment_id' => $roleAssignment->id])
            ->get(route('coordination.academic.curricula.index'))
            ->assertRedirect(route('role.index'));
    }

    public function test_role_from_another_user_is_not_revealed_or_selected(): void
    {
        $this->seed(DatabaseSeeder::class);
        $teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
        $foreignAssignment = RoleAssignment::query()
            ->where('usuario_id', '!=', $teacher->id)
            ->firstOrFail();

        $this->actingAs($teacher)
            ->post(route('role.store'), ['role_assignment_id' => $foreignAssignment->id])
            ->assertNotFound();

        $this->assertNotSame($foreignAssignment->id, session('active_role_assignment_id'));
    }

    /**
     * Le da un segundo rol elegible en una carrera propia: la base impide dos
     * coordinaciones solapadas sobre la misma carrera.
     */
    private function alsoCoordinates(User $user): void
    {
        $career = Career::query()->create([
            'facultad_id' => Faculty::query()->firstOrFail()->id,
            'codigo_institucional' => 'CARR-SEGUNDO-ROL',
            'nombre' => 'Carrera para segundo rol',
            'activo' => true,
        ]);
        $coordinatorRole = Role::query()->where('codigo', RoleCode::Coordinator->value)->firstOrFail();
        RoleAssignment::query()->create([
            'usuario_id' => $user->id,
            'rol_id' => $coordinatorRole->id,
            'carrera_id' => $career->id,
            'vigente_desde' => now()->subMonth(),
            'activo' => true,
        ]);
        CoordinatorAssignment::query()->create([
            'usuario_id' => $user->id,
            'carrera_id' => $career->id,
            'vigente_desde' => now()->subMonth(),
            'activo' => true,
        ]);
    }

    public function test_audit_events_cannot_be_updated_or_deleted(): void
    {
        $event = AuditEvent::query()->create([
            'accion' => 'test.append_only',
            'tipo_recurso' => 'test',
            'resultado' => 'success',
            'ocurrido_en' => now(),
        ]);

        $this->expectException(\LogicException::class);
        $event->update(['resultado' => 'failed']);
    }
}
