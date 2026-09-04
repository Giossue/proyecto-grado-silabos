<?php

namespace Tests\Feature\Academic;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/** I-39: cambiar quién coordina una carrera es un solo paso; la carrera no pierde nada. */
class CoordinatorReplacementTest extends TestCase
{
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    private User $coordinator;

    private Career $career;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
        $this->coordinator = User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
        $this->career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
    }

    public function test_the_careers_table_shows_who_coordinates_today(): void
    {
        $this->actingAsAdministrator()
            ->get(route('admin.academic.index', 'carreras'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('catalogs.careers.0.coordinator.id', $this->coordinator->id)
                ->has('options.coordinatorUsers'));
    }

    public function test_replacing_the_coordinator_closes_the_outgoing_mandate_and_role_and_opens_the_incoming_ones(): void
    {
        $incoming = $this->activeTeacher('entrante@silabos.test');

        $this->actingAsAdministrator()
            ->post(route('admin.academic.careers.coordinator.replace', $this->career), ['incoming_user_id' => $incoming->id])
            ->assertRedirect()
            ->assertSessionHasNoErrors()
            ->assertSessionHas('success');

        $this->assertDatabaseHas('asignaciones_coordinador', ['usuario_id' => $this->coordinator->id, 'carrera_id' => $this->career->id, 'activo' => false]);
        $this->assertTrue(CoordinatorAssignment::query()->effective()->where('carrera_id', $this->career->id)->where('usuario_id', $incoming->id)->exists());
        // Rol de coordinación: cerrado para quien sale, concedido a quien entra; el de docente del entrante sigue.
        $coordinatorRole = Role::query()->where('codigo', RoleCode::Coordinator->value)->firstOrFail();
        $this->assertDatabaseHas('asignaciones_rol', ['usuario_id' => $this->coordinator->id, 'rol_id' => $coordinatorRole->id, 'carrera_id' => $this->career->id, 'activo' => false]);
        $this->assertDatabaseHas('asignaciones_rol', ['usuario_id' => $incoming->id, 'rol_id' => $coordinatorRole->id, 'carrera_id' => $this->career->id, 'activo' => true]);
        $this->assertSame(2, RoleAssignment::query()->effective()->where('usuario_id', $incoming->id)->count());
        // Sin `deactivate_outgoing`, la cuenta saliente sigue activa (puede seguir como docente).
        $this->assertTrue($this->coordinator->fresh()->activo);
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'academico.coordinacion.reemplazada', 'recurso_id' => $this->career->id]);

        // La misma persona no se reemplaza a sí misma.
        $this->actingAsAdministrator()
            ->from(route('admin.academic.index', 'carreras'))
            ->post(route('admin.academic.careers.coordinator.replace', $this->career), ['incoming_user_id' => $incoming->id])
            ->assertSessionHasErrors('incoming_user_id');
    }

    public function test_deactivating_the_outgoing_coordinator_only_happens_when_no_other_role_remains(): void
    {
        $incoming = $this->activeTeacher('entrante@silabos.test');
        // La coordinadora sembrada también da clases: al reemplazarla no se desactiva.
        $teacherRole = Role::query()->where('codigo', RoleCode::Teacher->value)->firstOrFail();
        RoleAssignment::query()->create(['usuario_id' => $this->coordinator->id, 'rol_id' => $teacherRole->id, 'carrera_id' => $this->career->id, 'activo' => true]);

        $this->actingAsAdministrator()
            ->post(route('admin.academic.careers.coordinator.replace', $this->career), ['incoming_user_id' => $incoming->id, 'deactivate_outgoing' => 1])
            ->assertRedirect()
            ->assertSessionHasNoErrors();
        $this->assertTrue($this->coordinator->fresh()->activo);

        // Ahora sale el entrante, que solo coordina: sí se desactiva.
        $third = $this->activeTeacher('tercero@silabos.test');
        RoleAssignment::query()->where('usuario_id', $incoming->id)->where('rol_id', $teacherRole->id)->update(['activo' => false]);
        $this->actingAsAdministrator()
            ->post(route('admin.academic.careers.coordinator.replace', $this->career), ['incoming_user_id' => $third->id, 'deactivate_outgoing' => 1])
            ->assertRedirect()
            ->assertSessionHas('success', 'Coordinación de Software reemplazada; la cuenta saliente quedó desactivada.');
        $this->assertFalse($incoming->fresh()->activo);
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'usuario.desactivado', 'recurso_id' => $incoming->id]);
    }

    public function test_a_career_without_coordination_gets_one_assigned_with_the_same_action(): void
    {
        CoordinatorAssignment::query()->where('carrera_id', $this->career->id)->update(['activo' => false, 'vigente_hasta' => now()]);
        $incoming = $this->activeTeacher('primera@silabos.test');

        $this->actingAsAdministrator()
            ->post(route('admin.academic.careers.coordinator.replace', $this->career), ['incoming_user_id' => $incoming->id])
            ->assertRedirect()
            ->assertSessionHas('success', 'Coordinación de Software asignada.');
        $this->assertTrue(CoordinatorAssignment::query()->effective()->where('carrera_id', $this->career->id)->where('usuario_id', $incoming->id)->exists());
    }

    public function test_only_administration_replaces_coordinators(): void
    {
        $incoming = $this->activeTeacher('entrante@silabos.test');
        $context = $this->coordinator->roleAssignments()->firstOrFail();

        $this->actingAs($this->coordinator)
            ->withSession(['active_role_assignment_id' => $context->id])
            ->post(route('admin.academic.careers.coordinator.replace', $this->career), ['incoming_user_id' => $incoming->id])
            ->assertForbidden();
    }

    private function activeTeacher(string $email): User
    {
        $user = User::query()->create(['nombre' => 'Docente '.$email, 'correo_electronico' => $email, 'contrasena' => 'Temporal-2026!', 'activo' => true]);
        RoleAssignment::query()->create([
            'usuario_id' => $user->id,
            'rol_id' => Role::query()->where('codigo', RoleCode::Teacher->value)->firstOrFail()->id,
            'carrera_id' => $this->career->id,
            'activo' => true,
        ]);

        return $user;
    }

    private function actingAsAdministrator(): static
    {
        $this->actingAs($this->administrator)->withSession(['active_role_assignment_id' => $this->administratorContext->id]);

        return $this;
    }
}
