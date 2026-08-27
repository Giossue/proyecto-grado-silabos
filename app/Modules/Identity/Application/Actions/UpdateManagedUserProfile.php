<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Corrige el nombre y el correo de una cuenta.
 *
 * El correo es la identidad con la que se inicia sesión, así que el cambio se audita con
 * el valor anterior: si alguien queda fuera del sistema, hay cómo saber qué pasó y cuándo.
 */
class UpdateManagedUserProfile
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{name: string, email: string} $data */
    public function execute(User $target, array $data, User $actor, Request $request): User
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($activeRole, $actor, $data, $request, $target): User {
            $locked = User::query()->lockForUpdate()->findOrFail($target->id);
            $previous = ['name' => $locked->name, 'email' => $locked->email];
            $email = mb_strtolower($data['email']);

            $locked->update(['name' => $data['name'], 'email' => $email]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'user.profile_updated',
                resourceType: 'user',
                resourceId: $locked->id,
                result: 'success',
                metadata: [
                    'previous_name' => $previous['name'],
                    'previous_email' => $previous['email'],
                    'name_changed' => $previous['name'] !== $data['name'],
                    'email_changed' => $previous['email'] !== $email,
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked->refresh();
        });
    }
}
