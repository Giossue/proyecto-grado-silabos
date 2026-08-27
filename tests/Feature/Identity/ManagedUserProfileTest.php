<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Mail\ManagedUserCredentialsMail;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Quién puede corregir el nombre y el correo de una cuenta, y qué recibe quien la estrena.
 *
 * La coordinación alcanza solo a los docentes de su carrera: corregir datos de personas
 * que no se dirigen sería gobierno ajeno, no una corrección.
 */
class ManagedUserProfileTest extends TestCase
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

    public function test_a_coordinator_corrects_a_teacher_of_their_own_career(): void
    {
        $this->actingAsCoordinator()
            ->patch(route('users.profile.update', $this->teacher), [
                'name' => 'Docente Corregida',
                'email' => 'docente.corregida@silabos.test',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->teacher->refresh();
        $this->assertSame('Docente Corregida', $this->teacher->name);
        $this->assertSame('docente.corregida@silabos.test', $this->teacher->email);

        // El valor anterior queda registrado: el correo es con lo que se inicia sesión.
        $this->assertDatabaseHas('eventos_auditoria', [
            'accion' => 'user.profile_updated',
            'recurso_id' => $this->teacher->id,
            'resultado' => 'success',
        ]);
    }

    public function test_a_coordinator_cannot_touch_a_teacher_of_another_career(): void
    {
        $outsider = $this->teacherInOtherCareer();

        $this->actingAsCoordinator()
            ->patch(route('users.profile.update', $outsider), [
                'name' => 'Intento Ajeno',
                'email' => 'intento@silabos.test',
            ])
            ->assertForbidden();

        $this->assertSame('Docente Ajena', $outsider->fresh()->name);
    }

    public function test_a_coordinator_cannot_touch_an_administrator(): void
    {
        $this->actingAsCoordinator()
            ->patch(route('users.profile.update', $this->administrator), [
                'name' => 'Intento',
                'email' => 'intento@silabos.test',
            ])
            ->assertForbidden();
    }

    public function test_an_administrator_corrects_any_account(): void
    {
        $outsider = $this->teacherInOtherCareer();

        $this->actingAsAdministrator()
            ->patch(route('users.profile.update', $outsider), [
                'name' => 'Docente Ajena Corregida',
                'email' => 'ajena.corregida@silabos.test',
            ])
            ->assertRedirect();

        $this->assertSame('Docente Ajena Corregida', $outsider->fresh()->name);
    }

    public function test_a_teacher_cannot_correct_anyone(): void
    {
        $teacherContext = $this->teacher->roleAssignments()->firstOrFail();

        $this->actingAs($this->teacher)
            ->withSession(['active_role_assignment_id' => $teacherContext->id])
            ->patch(route('users.profile.update', $this->coordinator), [
                'name' => 'Intento',
                'email' => 'intento@silabos.test',
            ])
            ->assertForbidden();
    }

    public function test_the_email_must_stay_unique_but_may_keep_its_own_value(): void
    {
        $this->actingAsAdministrator()
            ->patch(route('users.profile.update', $this->teacher), [
                'name' => 'Docente Demo',
                'email' => 'coordinador@silabos.test',
            ])
            ->assertSessionHasErrors('email');

        // Guardar sin tocar el correo no puede chocar consigo misma.
        $this->actingAsAdministrator()
            ->patch(route('users.profile.update', $this->teacher), [
                'name' => 'Docente Renombrada',
                'email' => 'docente@silabos.test',
            ])
            ->assertRedirect();

        $this->assertSame('Docente Renombrada', $this->teacher->fresh()->name);
    }

    public function test_creating_an_account_sends_its_credentials_by_email(): void
    {
        Mail::fake();
        $career = Career::query()->where('codigo_institucional', 'SOFTWARE')->firstOrFail();

        $this->actingAsAdministrator()
            ->post(route('admin.users.store'), [
                'name' => 'Docente Nueva',
                'email' => 'docente.nueva@silabos.test',
                'password' => 'Temporal-2026!',
                'role_code' => RoleCode::Teacher->value,
                'career_id' => $career->id,
            ])
            ->assertRedirect();

        Mail::assertQueued(
            ManagedUserCredentialsMail::class,
            function (ManagedUserCredentialsMail $mail): bool {
                return $mail->hasTo('docente.nueva@silabos.test')
                    && $mail->temporaryPassword === 'Temporal-2026!'
                    && $mail->roleName === 'Docente';
            },
        );
    }

    public function test_the_credentials_email_carries_what_is_needed_to_enter(): void
    {
        $rendered = (new ManagedUserCredentialsMail(
            name: 'Docente Prueba',
            email: 'docente.prueba@silabos.test',
            temporaryPassword: 'Temporal-2026!',
            roleName: 'Docente',
            loginUrl: 'https://silabos.test/login',
        ))->render();

        $this->assertStringContainsString('docente.prueba@silabos.test', $rendered);
        $this->assertStringContainsString('Temporal-2026!', $rendered);
        $this->assertStringContainsString('https://silabos.test/login', $rendered);
        // Se avisa de que caduca al usarla: el mensaje queda en el buzón.
        $this->assertStringContainsString('un solo uso', $rendered);
    }

    private function teacherInOtherCareer(): User
    {
        $faculty = Faculty::query()->firstOrFail();
        $career = Career::query()->create([
            'facultad_id' => $faculty->id,
            'codigo_institucional' => 'OTRA',
            'nombre' => 'Otra carrera',
            'activo' => true,
        ]);
        $role = Role::query()->where('codigo', RoleCode::Teacher->value)->firstOrFail();
        $user = User::query()->create([
            'name' => 'Docente Ajena',
            'email' => 'ajena@silabos.test',
            'password' => 'Temporal-2026!',
            'active' => true,
        ]);
        RoleAssignment::query()->create([
            'usuario_id' => $user->id,
            'rol_id' => $role->id,
            'carrera_id' => $career->id,
            'vigente_desde' => now()->subMonth(),
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
