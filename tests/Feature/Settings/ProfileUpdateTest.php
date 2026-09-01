<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_page_is_displayed()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->get(route('profile.edit'));

        $response->assertOk();
    }

    public function test_an_administrator_can_update_their_profile_information()
    {
        $this->seed(DatabaseSeeder::class);
        $user = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $activeRole = $user->roleAssignments()->firstOrFail();

        $response = $this
            ->actingAs($user)
            ->withSession(['active_role_assignment_id' => $activeRole->id])
            ->patch(route('profile.update'), [
                'nombre' => 'Test User',
                'correo_electronico' => 'test@example.com',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('profile.edit'));

        $user->refresh();

        $this->assertSame('Test User', $user->nombre);
        $this->assertSame('test@example.com', $user->correo_electronico);
        $this->assertNull($user->correo_verificado_en);
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'usuario.perfil_actualizado',
            'actor_usuario_id' => $user->id,
            'recurso_id' => $user->id,
        ]);
    }

    public function test_a_teacher_cannot_update_their_own_name_or_email()
    {
        $this->seed(DatabaseSeeder::class);
        $user = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $activeRole = $user->roleAssignments()->firstOrFail();
        $originalName = $user->nombre;
        $originalEmail = $user->correo_electronico;

        $response = $this
            ->actingAs($user)
            ->withSession(['active_role_assignment_id' => $activeRole->id])
            ->patch(route('profile.update'), [
                'nombre' => 'Test User',
                'correo_electronico' => 'otro.correo@silabos.test',
            ]);

        $response->assertForbidden();

        $user->refresh();
        $this->assertSame($originalName, $user->nombre);
        $this->assertSame($originalEmail, $user->correo_electronico);
    }

    public function test_account_deletion_is_not_exposed_from_profile_settings()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->delete('/settings/profile', [
                'password' => 'password',
            ]);

        $response->assertStatus(405);
        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh());
    }
}
