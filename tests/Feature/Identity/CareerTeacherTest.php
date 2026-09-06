<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Identity\Infrastructure\Mail\ManagedUserCredentialsMail;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class CareerTeacherTest extends TestCase
{
    use RefreshDatabase;

    private User $coordinator;

    private RoleAssignment $context;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        Mail::fake();
        $this->coordinator = User::query()->where('correo_electronico', 'coordinador@silabos.test')->firstOrFail();
        $this->context = $this->coordinator->roleAssignments()->firstOrFail();
        $this->actingAs($this->coordinator)->withSession(['active_role_assignment_id' => $this->context->id]);
    }

    private function payload(): array
    {
        return ['nombre' => 'Nuevo Docente', 'correo_electronico' => 'nuevo@silabos.test', 'password' => 'Temporal-Segura2026!'];
    }

    public function test_creates_only_a_teacher_in_current_career_and_is_idempotent(): void
    {
        $this->post(route('coordination.teachers.store'), $this->payload())->assertRedirect()->assertSessionHasNoErrors();
        $user = User::query()->where('correo_electronico', 'nuevo@silabos.test')->firstOrFail();
        $this->assertTrue(Hash::check($this->payload()['password'], $user->contrasena));
        $this->assertTrue($user->debe_cambiar_contrasena);
        $this->assertSame(1, $user->roleAssignments()->count());
        $assignment = $user->roleAssignments()->firstOrFail();
        $this->assertSame('docente', $assignment->role->codigo);
        $this->assertSame($this->context->carrera_id, $assignment->carrera_id);
        $this->get(route('coordination.academic.teacher-assignments.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('canCreateTeacher', true)
                ->where('career.id', $this->context->carrera_id)
                ->where('options.teacherUsers', fn ($users) => collect($users)->contains('id', $user->id)));
        $this->post(route('coordination.teachers.store'), [...$this->payload(), 'correo_electronico' => ' NUEVO@silabos.test ', 'nombre' => 'Otro nombre'])->assertSessionHasNoErrors();
        $this->assertSame($user->nombre, $user->fresh()->nombre);
        $this->assertSame(1, $user->roleAssignments()->count());
        Mail::assertQueued(ManagedUserCredentialsMail::class, 1);
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'usuario.docente_incorporado', 'actor_usuario_id' => $this->coordinator->id, 'recurso_id' => $user->id]);
    }

    public function test_existing_identity_and_other_roles_are_preserved_without_sending_credentials(): void
    {
        $user = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $original = $user->getAttributes();
        $this->post(route('coordination.teachers.store'), [...$this->payload(), 'correo_electronico' => $user->correo_electronico])->assertSessionHasNoErrors();
        $this->assertSame($original, $user->fresh()->getAttributes());
        $this->assertSame(2, $user->roleAssignments()->count());
        Mail::assertNothingQueued();
    }

    public function test_cannot_reactivate_disabled_account_or_revoked_teacher_access(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $teacher->update(['activo' => false]);
        $data = [...$this->payload(), 'correo_electronico' => $teacher->correo_electronico];
        $this->postJson(route('coordination.teachers.store'), $data)->assertUnprocessable()->assertJsonValidationErrors('correo_electronico');
        $this->assertFalse($teacher->fresh()->activo);
        $teacher->update(['activo' => true]);
        $teacher->roleAssignments()->update(['activo' => false]);
        $this->postJson(route('coordination.teachers.store'), $data)->assertUnprocessable()->assertJsonValidationErrors('correo_electronico');
        $this->assertFalse($teacher->roleAssignments()->firstOrFail()->activo);
        Mail::assertNothingQueued();
    }

    public function test_cannot_choose_role_career_or_global_account_state(): void
    {
        foreach (['role_code' => 'administrador', 'career_id' => $this->context->carrera_id, 'user_id' => $this->coordinator->id, 'active' => true, 'activo' => true] as $field => $value) {
            $this->postJson(route('coordination.teachers.store'), [...$this->payload(), $field => $value])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->assertDatabaseMissing('usuarios', ['correo_electronico' => 'nuevo@silabos.test']);
        $this->postJson(route('admin.users.store'), [...$this->payload(), 'role_code' => 'administrador'])->assertForbidden();
        Mail::assertNothingQueued();
    }

    public function test_other_active_roles_cannot_use_coordinator_endpoint(): void
    {
        foreach (['admin@silabos.test', 'docente@silabos.test'] as $email) {
            $user = User::query()->where('correo_electronico', $email)->firstOrFail();
            $this->actingAs($user)->withSession(['active_role_assignment_id' => $user->roleAssignments()->firstOrFail()->id])
                ->postJson(route('coordination.teachers.store'), $this->payload())->assertForbidden();
        }
        Mail::assertNothingQueued();
    }

    public function test_inactive_career_cannot_create_teachers(): void
    {
        $this->context->career->update(['activo' => false]);
        $this->postJson(route('coordination.teachers.store'), $this->payload())->assertForbidden();
        $this->assertDatabaseMissing('usuarios', ['correo_electronico' => 'nuevo@silabos.test']);
    }

    public function test_invalid_identity_and_weak_password_are_rejected(): void
    {
        $this->postJson(route('coordination.teachers.store'), ['nombre' => '', 'correo_electronico' => 'invalid', 'password' => '123'])
            ->assertUnprocessable()->assertJsonValidationErrors(['nombre', 'correo_electronico', 'password']);
        Mail::assertNothingQueued();
    }

    public function test_failure_after_account_creation_rolls_back_account_role_and_mail(): void
    {
        $this->partialMock(RecordAuditEvent::class, function ($mock): void {
            $mock->shouldReceive('execute')->withArgs(fn (...$args) => $args[2] === 'usuario.docente_incorporado')
                ->once()->andThrow(new \RuntimeException('Synthetic audit failure'));
        });
        $before = RoleAssignment::query()->count();
        $this->withoutExceptionHandling();
        try {
            $this->post(route('coordination.teachers.store'), $this->payload());
            $this->fail('Expected audit failure');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Synthetic audit failure', $exception->getMessage());
        }
        $this->assertDatabaseMissing('usuarios', ['correo_electronico' => 'nuevo@silabos.test']);
        $this->assertSame($before, RoleAssignment::query()->count());
        Mail::assertNothingQueued();
    }

    public function test_historical_inactive_role_does_not_override_current_teacher_access(): void
    {
        $teacher = User::query()->where('correo_electronico', 'docente@silabos.test')->firstOrFail();
        $historic = $teacher->roleAssignments()->firstOrFail()->replicate();
        $historic->activo = false;
        $historic->save();
        $this->post(route('coordination.teachers.store'), [...$this->payload(), 'correo_electronico' => $teacher->correo_electronico])->assertSessionHasNoErrors();
        $this->assertSame(2, $teacher->roleAssignments()->count());
        Mail::assertNothingQueued();
    }
}
