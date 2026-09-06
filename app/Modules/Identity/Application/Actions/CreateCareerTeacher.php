<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class CreateCareerTeacher
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly CreateManagedUser $createUser,
        private readonly RecordAuditEvent $audit,
    ) {}

    /**
     * @param  array{nombre: string, correo_electronico: string, password: string}  $data
     * @return array{created: bool, attached: bool}
     */
    public function execute(array $data, User $actor, Request $request): array
    {
        Gate::forUser($actor)->authorize('createCareerTeacher', User::class);
        $activeRole = $this->roles->resolve($request);
        abort_unless($activeRole?->carrera_id !== null, 403);
        $careerId = $activeRole->carrera_id;
        $email = mb_strtolower(trim($data['correo_electronico']));

        return DB::transaction(function () use ($data, $actor, $request, $activeRole, $careerId, $email): array {
            $user = $this->findAccount($email);
            $created = false;

            if ($user === null) {
                try {
                    // El caso existente abre un savepoint: la colisión de correo no
                    // deja abortada esta transacción ni altera el alta administrativa.
                    $user = $this->createUser->execute([
                        ...$data,
                        'correo_electronico' => $email,
                        'role_code' => RoleCode::Teacher->value,
                        'career_id' => $careerId,
                    ], $actor, $request);
                    $created = true;
                } catch (UniqueConstraintViolationException $exception) {
                    // Otra alta simultánea pudo crear la misma identidad mientras
                    // esperábamos el índice único. Reutilizarla no cambia su acceso.
                    $user = $this->findAccount($email) ?? throw $exception;
                }
            }

            if (! $user->activo) {
                throw ValidationException::withMessages([
                    'correo_electronico' => 'No se puede incorporar esta cuenta. Solicite a Administración que revise su acceso.',
                ]);
            }

            $teacherRole = Role::query()->where('codigo', RoleCode::Teacher->value)->firstOrFail();
            $identity = [
                'usuario_id' => $user->id,
                'rol_id' => $teacherRole->id,
                'carrera_id' => $careerId,
            ];
            // Puede haber asignaciones históricas inactivas junto a una vigente.
            $assignment = RoleAssignment::query()->where($identity)->orderByDesc('activo')->first();

            if ($assignment !== null && ! $assignment->activo) {
                throw ValidationException::withMessages([
                    'correo_electronico' => 'El acceso docente a esta carrera fue retirado. Solicite su revisión a Administración.',
                ]);
            }

            $assignment ??= RoleAssignment::query()->firstOrCreate([...$identity, 'activo' => true]);

            $attached = $created || $assignment->wasRecentlyCreated;

            if ($attached) {
                $this->audit->execute(
                    actorId: $actor->id,
                    roleAssignmentId: $activeRole->id,
                    action: 'usuario.docente_incorporado',
                    resourceType: 'usuario',
                    resourceId: $user->id,
                    result: 'exito',
                    metadata: ['carrera_id' => $careerId, 'cuenta_creada' => $created],
                    correlationId: $request->attributes->getString('correlation_id') ?: null,
                );
            }

            return ['created' => $created, 'attached' => $attached];
        });
    }

    private function findAccount(string $email): ?User
    {
        // También respeta el correo histórico si originalmente usaba mayúsculas.
        return User::query()->whereRaw('lower(correo_electronico) = ?', [$email])->lockForUpdate()->first();
    }
}
