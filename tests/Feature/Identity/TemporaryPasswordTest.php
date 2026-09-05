<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Infrastructure\Persistence\Models\AuditEvent;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * La contraseña con la que un administrador crea una cuenta la conoce quien la generó.
 * Mientras siga vigente, la sesión no puede operar: el bloqueo es del servidor, porque
 * un diálogo que solo vive en el navegador se esquiva escribiendo la URL a mano.
 */
class TemporaryPasswordTest extends TestCase
{
    use RefreshDatabase;

    private User $administrator;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);
        $this->administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
    }

    public function test_an_account_created_by_an_administrator_is_born_with_a_temporary_password(): void
    {
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $context = $this->administrator->roleAssignments()->firstOrFail();

        $this->actingAs($this->administrator)
            ->withSession(['active_role_assignment_id' => $context->id])
            ->post(route('admin.users.store'), [
                'nombre' => 'Docente Nueva',
                'correo_electronico' => 'docente.nueva@silabos.test',
                'password' => 'Temporal-2026!',
                'role_code' => RoleCode::Teacher->value,
                'career_id' => $career->id,
            ])
            ->assertRedirect();

        $this->assertTrue(
            User::query()->where('correo_electronico', 'docente.nueva@silabos.test')->firstOrFail()->debe_cambiar_contrasena,
        );
    }

    public function test_the_user_list_shows_which_accounts_have_never_been_used(): void
    {
        $career = Career::query()
            ->where('codigo_institucional', 'SOFTWARE')->firstOrFail();
        $context = $this->administrator->roleAssignments()->firstOrFail();

        $this->actingAs($this->administrator)
            ->withSession(['active_role_assignment_id' => $context->id])
            ->post(route('admin.users.store'), [
                'nombre' => 'Docente Nuevo Sin Estrenar',
                'correo_electronico' => 'nuevo.sin.estrenar@silabos.test',
                'password' => 'Temporal-2026!',
                'role_code' => RoleCode::Teacher->value,
                'career_id' => $career->id,
            ])->assertRedirect();

        $this->actingAs($this->administrator)
            ->withSession(['active_role_assignment_id' => $context->id])
            ->get(route('admin.users.index', ['q' => 'Docente Nuevo Sin Estrenar']))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('users.data', 1)
                ->where('users.data.0.pending_first_login', true)
                ->where('users.data.0.active', true));
    }

    public function test_the_seeded_administrator_is_not_locked_out_of_a_fresh_installation(): void
    {
        // Si la instalación naciera bloqueada no habría por dónde crear la primera cuenta.
        $this->assertFalse($this->administrator->debe_cambiar_contrasena);
    }

    public function test_a_temporary_password_blocks_every_other_route(): void
    {
        $user = $this->userWithTemporaryPassword();

        foreach ([
            route('admin.users.index'),
            route('profile.edit'),
            route('security.edit'),
            route('notifications.index'),
            route('home'),
        ] as $url) {
            $this->actingAs($user)
                ->get($url)
                ->assertRedirect(route('dashboard'));
        }
    }

    public function test_a_coordinator_with_a_temporary_password_can_still_choose_the_career(): void
    {
        // Coordinación no tiene rol activo hasta elegir carrera: el panel manda a la
        // elección y esta debe abrirse, no rebotar al panel (bucle de redirecciones).
        $coordinator = User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
        $coordinator->forceFill(['contrasena' => Hash::make('Temporal-2026!'), 'debe_cambiar_contrasena' => true])->save();

        $this->actingAs($coordinator)->get(route('dashboard'))->assertRedirect(route('role.index'));
        $this->actingAs($coordinator)->get(route('role.index'))->assertOk();

        $this->actingAs($coordinator)
            ->post(route('role.store'), ['role_assignment_id' => $coordinator->roleAssignments()->firstOrFail()->id])
            ->assertRedirect(route('dashboard'));
        $this->actingAs($coordinator)->followingRedirects()->get(route('dashboard'))->assertOk();
    }

    public function test_the_dashboard_the_change_and_the_logout_stay_reachable(): void
    {
        $user = $this->userWithTemporaryPassword();

        // El panel es la superficie sobre la que aparece el diálogo, así que debe renderizar.
        $this->actingAs($user)->followingRedirects()->get(route('dashboard'))->assertOk();
        $this->actingAs($user)->post(route('logout'))->assertRedirect();
    }

    public function test_an_api_client_receives_a_refusal_instead_of_a_redirect(): void
    {
        $user = $this->userWithTemporaryPassword();

        $this->actingAs($user)
            ->getJson(route('admin.users.index'))
            ->assertForbidden();
    }

    public function test_changing_the_password_unlocks_the_session_and_records_the_event(): void
    {
        $user = $this->userWithTemporaryPassword();

        $this->actingAs($user)
            ->put(route('user-password.update'), [
                'current_password' => 'Temporal-2026!',
                'password' => 'Definitiva-2026!',
                'password_confirmation' => 'Definitiva-2026!',
            ])
            ->assertRedirect();

        $user->refresh();

        $this->assertFalse($user->debe_cambiar_contrasena);
        $this->assertTrue(Hash::check('Definitiva-2026!', $user->contrasena));
        $this->assertDatabaseHas('eventos_auditoria', [
            'actor_usuario_id' => $user->id,
            'accion' => 'usuario.contrasena_temporal_cambiada',
            'recurso_id' => $user->id,
            'resultado' => 'exito',
        ]);

        // Con la marca apagada, la sesión vuelve a operar donde antes rebotaba.
        $this->actingAs($user)->followingRedirects()->get(route('notifications.index'))->assertOk();
    }

    public function test_a_rejected_change_keeps_the_session_blocked(): void
    {
        $user = $this->userWithTemporaryPassword();

        $this->actingAs($user)
            ->put(route('user-password.update'), [
                'current_password' => 'la-que-no-es',
                'password' => 'Definitiva-2026!',
                'password_confirmation' => 'Definitiva-2026!',
            ])
            ->assertSessionHasErrors('current_password');

        $this->assertTrue($user->refresh()->debe_cambiar_contrasena);
        $this->actingAs($user)->get(route('notifications.index'))->assertRedirect(route('dashboard'));
    }

    public function test_repeating_the_temporary_password_is_not_a_change(): void
    {
        $user = $this->userWithTemporaryPassword();

        $this->actingAs($user)
            ->put(route('user-password.update'), [
                'current_password' => 'Temporal-2026!',
                'password' => 'Temporal-2026!',
                'password_confirmation' => 'Temporal-2026!',
            ])
            ->assertSessionHasErrors(['password' => 'La contraseña nueva debe ser distinta de la actual.']);

        $this->assertTrue($user->refresh()->debe_cambiar_contrasena);
        $this->assertDatabaseMissing('eventos_auditoria', ['accion' => 'usuario.contrasena_temporal_cambiada']);
    }

    public function test_the_audit_event_never_carries_the_password(): void
    {
        $user = $this->userWithTemporaryPassword();

        $this->actingAs($user)->put(route('user-password.update'), [
            'current_password' => 'Temporal-2026!',
            'password' => 'Definitiva-2026!',
            'password_confirmation' => 'Definitiva-2026!',
        ]);

        $metadata = json_encode(
            AuditEvent::query()
                ->where('accion', 'usuario.contrasena_temporal_cambiada')
                ->firstOrFail()
                ->metadatos,
        );

        $this->assertStringNotContainsString('Temporal-2026!', (string) $metadata);
        $this->assertStringNotContainsString('Definitiva-2026!', (string) $metadata);
    }

    private function userWithTemporaryPassword(): User
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $teacher->forceFill([
            'contrasena' => Hash::make('Temporal-2026!'),
            'debe_cambiar_contrasena' => true,
        ])->save();

        return $teacher;
    }
}
