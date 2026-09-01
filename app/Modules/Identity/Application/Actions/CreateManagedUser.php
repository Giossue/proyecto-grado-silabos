<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Application\CoordinationMandate;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Mail\ManagedUserCredentialsMail;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class CreateManagedUser
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly CoordinationMandate $mandate,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{nombre: string, correo_electronico: string, password: string, role_code: string, career_id?: string|null} $data */
    public function execute(array $data, User $actor, Request $request): User
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $data, $request): User {
            $user = User::query()->create([
                'nombre' => $data['nombre'],
                'correo_electronico' => mb_strtolower($data['correo_electronico']),
                'contrasena' => $data['password'],
                'activo' => true,
                // Quien crea la cuenta conoce la contraseña, así que deja de ser secreta
                // en cuanto se entrega: su titular la cambia antes de operar.
                'debe_cambiar_contrasena' => true,
            ]);
            $role = Role::query()->where('codigo', $data['role_code'])->firstOrFail();
            $careerId = $data['role_code'] === RoleCode::Administrator->value
                ? null
                : ($data['career_id'] ?? null);

            RoleAssignment::query()->create([
                'usuario_id' => $user->id,
                'rol_id' => $role->id,
                'carrera_id' => $careerId,
                'vigente_desde' => now(),
                'activo' => true,
            ]);

            $this->mandate->open(
                $user->id,
                $data['role_code'],
                $careerId,
                now()->toDateTimeString(),
            );

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'usuario.creado',
                resourceType: 'usuario',
                resourceId: $user->id,
                result: 'exito',
                metadata: ['initial_role' => $data['role_code']],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            // Después del commit: si la transacción se deshace, nadie recibe las
            // credenciales de una cuenta que no llegó a existir.
            DB::afterCommit(function () use ($data, $role, $user): void {
                Mail::to($user->correo_electronico)->send(new ManagedUserCredentialsMail(
                    name: $user->nombre,
                    email: $user->correo_electronico,
                    temporaryPassword: $data['password'],
                    roleName: $role->nombre,
                    loginUrl: route('login'),
                ));
            });

            return $user;
        });
    }
}
