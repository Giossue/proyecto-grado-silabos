<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Guardado único del panel «Editar cuenta»: identidad siempre; estado y rol solo si vienen.
 *
 * El panel reúne lo que antes eran tres acciones separadas. La política no cambia con la
 * unificación: la identidad la corrige Administración incluso sobre su propia cuenta; el
 * estado y los roles excluyen la autogestión.
 */
class ManagedUserUpdateTest extends TestCase
{
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    private User $coordinator;

    private RoleAssignment $coordinatorContext;

    private User $teacher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);

        $this->administrator = User::query()->where('email', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('email', 'coordinador@silabos.test')->firstOrFail();
        $this->coordinatorContext = $this->coordinator->roleAssignments()->firstOrFail();
        $this->teacher = User::query()->where('email', 'docente@silabos.test')->firstOrFail();
    }

    public function test_an_administrator_edits_identity_and_status_in_one_save(): void
    {
        $this->actingAsAdministrator()
            ->patch(route('admin.users.update', $this->teacher), [
                'name' => 'Docente Corregida',
                'email' => 'docente.corregida@silabos.test',
                'active' => false,
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->teacher->refresh();
        $this->assertSame('Docente Corregida', $this->teacher->name);
        $this->assertSame('docente.corregida@silabos.test', $this->teacher->email);
        $this->assertFalse($this->teacher->active);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'user.profile_updated',
            'recurso_id' => $this->teacher->id,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'user.deactivated',
            'recurso_id' => $this->teacher->id,
        ]);
    }

    public function test_an_administrator_adds_a_role_in_the_same_save(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $previousAssignmentId = $this->coordinator->roleAssignments()->firstOrFail()->id;

        $this->actingAsAdministrator()
            ->patch(route('admin.users.update', $this->coordinator), [
                'name' => $this->coordinator->name,
                'email' => $this->coordinator->email,
                'active' => true,
                'role_code' => RoleCode::Teacher->value,
                'career_id' => $career->id,
                'valid_from' => now()->toDateString(),
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $teacherRole = Role::query()->where('codigo', RoleCode::Teacher->value)->firstOrFail();
        $this->assertDatabaseHas('asignaciones_rol', ['id' => $previousAssignmentId, 'activo' => true]);
        $this->assertDatabaseHas('asignaciones_rol', [
            'usuario_id' => $this->coordinator->id,
            'rol_id' => $teacherRole->id,
            'carrera_id' => $career->id,
            'activo' => true,
        ]);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'user.role_assigned',
            'recurso_id' => $this->coordinator->id,
        ]);
    }

    public function test_saving_without_touching_status_or_role_registers_nothing_extra(): void
    {
        $assignmentsBefore = $this->teacher->roleAssignments()->count();

        $this->actingAsAdministrator()
            ->patch(route('admin.users.update', $this->teacher), [
                'name' => 'Docente Renombrada',
                'email' => $this->teacher->email,
                'active' => true,
            ])
            ->assertRedirect();

        $this->teacher->refresh();
        $this->assertSame('Docente Renombrada', $this->teacher->name);
        $this->assertTrue($this->teacher->active);
        $this->assertSame($assignmentsBefore, $this->teacher->roleAssignments()->count());
        // El estado no cambió, así que no se inventa un evento de activación.
        $this->assertDatabaseMissing('eventos_auditoria', [
            'accion' => 'user.activated',
            'recurso_id' => $this->teacher->id,
        ]);
    }

    public function test_the_own_account_only_corrects_its_identity(): void
    {
        $this->actingAsAdministrator()
            ->patch(route('admin.users.update', $this->administrator), [
                'name' => 'Administración Renombrada',
                'email' => 'admin@silabos.test',
            ])
            ->assertRedirect();

        $this->assertSame('Administración Renombrada', $this->administrator->fresh()->name);

        // Tocar el propio estado o concederse un rol se rechaza completo: la
        // desactivación y los privilegios de la propia cuenta son de otra administración.
        $this->actingAsAdministrator()
            ->patch(route('admin.users.update', $this->administrator), [
                'name' => 'Administración Renombrada',
                'email' => 'admin@silabos.test',
                'active' => false,
            ])
            ->assertForbidden();

        $this->actingAsAdministrator()
            ->patch(route('admin.users.update', $this->administrator), [
                'name' => 'Administración Renombrada',
                'email' => 'admin@silabos.test',
                'role_code' => RoleCode::Administrator->value,
                'valid_from' => now()->toDateString(),
            ])
            ->assertForbidden();

        $this->assertTrue($this->administrator->fresh()->active);
    }

    public function test_a_coordinator_cannot_use_the_unified_edit(): void
    {
        $this->actingAsCoordinator()
            ->patch(route('admin.users.update', $this->teacher), [
                'name' => 'Intento',
                'email' => 'intento@silabos.test',
            ])
            ->assertForbidden();

        $this->assertSame('Docente Demo', $this->teacher->fresh()->name);
    }

    public function test_a_scoped_role_requires_its_career(): void
    {
        $this->actingAsAdministrator()
            ->patch(route('admin.users.update', $this->teacher), [
                'name' => $this->teacher->name,
                'email' => $this->teacher->email,
                'active' => true,
                'role_code' => RoleCode::Teacher->value,
                'valid_from' => now()->toDateString(),
            ])
            ->assertSessionHasErrors('career_id');
    }

    public function test_a_deactivation_closes_a_mandate_granted_in_the_same_save(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();

        // La carrera solo admite una coordinación vigente: se retira antes a quien la ejerce.
        $this->actingAsAdministrator()
            ->patch(route('admin.users.status.update', $this->coordinator), ['active' => false])
            ->assertRedirect();

        $this->actingAsAdministrator()
            ->patch(route('admin.users.update', $this->teacher), [
                'name' => $this->teacher->name,
                'email' => $this->teacher->email,
                'active' => false,
                'role_code' => RoleCode::Coordinator->value,
                'career_id' => $career->id,
                'valid_from' => now()->toDateString(),
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        // El estado se aplica al final: el nombramiento recién concedido queda cerrado y
        // la cuenta desactivada no deja la carrera bloqueada con una coordinación abierta.
        $this->assertDatabaseHas('usuarios', ['id' => $this->teacher->id, 'active' => false]);
        $this->assertDatabaseHas('asignaciones_coordinador', [
            'usuario_id' => $this->teacher->id,
            'carrera_id' => $career->id,
            'activo' => false,
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
