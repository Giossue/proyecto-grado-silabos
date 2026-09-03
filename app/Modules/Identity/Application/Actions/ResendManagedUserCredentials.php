<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\TemporaryPassword;
use App\Modules\Identity\Infrastructure\Mail\ManagedUserCredentialsMail;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * Vuelve a entregar el acceso a una cuenta que nadie ha estrenado: se genera otra
 * contraseña temporal (la anterior deja de valer) y se envía al correo actual. Solo
 * mientras la cuenta esté pendiente de activación: una cuenta en uso recupera su
 * contraseña por la vía normal, no por Administración (I-38).
 */
class ResendManagedUserCredentials
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(User $target, User $actor, Request $request, string $reason = 'reenvio'): User
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($activeRole, $actor, $reason, $request, $target): User {
            $locked = User::query()->lockForUpdate()->findOrFail($target->id);
            if (! $locked->debe_cambiar_contrasena) {
                throw ValidationException::withMessages([
                    'user' => 'La cuenta ya fue activada por su titular; no se reenvía un acceso temporal.',
                ]);
            }

            $password = TemporaryPassword::generate();
            $locked->forceFill(['contrasena' => $password, 'debe_cambiar_contrasena' => true])->save();
            DB::table('sesiones')->where('user_id', $locked->id)->delete();
            $roleName = $locked->roleAssignments()->where('activo', true)->with('role')->first()?->role->nombre ?? 'Usuario';

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'usuario.acceso_reenviado',
                resourceType: 'usuario',
                resourceId: $locked->id,
                result: 'exito',
                metadata: ['reason' => $reason, 'email' => $locked->correo_electronico],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            DB::afterCommit(function () use ($locked, $password, $roleName): void {
                Mail::to($locked->correo_electronico)->send(new ManagedUserCredentialsMail(
                    name: $locked->nombre,
                    email: $locked->correo_electronico,
                    temporaryPassword: $password,
                    roleName: $roleName,
                    loginUrl: route('login'),
                ));
            });

            return $locked;
        });
    }
}
