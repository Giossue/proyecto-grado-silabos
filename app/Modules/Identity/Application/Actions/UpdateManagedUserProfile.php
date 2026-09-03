<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\PersonName;
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
        private readonly ResendManagedUserCredentials $credentials,
    ) {}

    /** @param array{nombre: string, correo_electronico: string} $data */
    public function execute(User $target, array $data, User $actor, Request $request): User
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($activeRole, $actor, $data, $request, $target): User {
            $locked = User::query()->lockForUpdate()->findOrFail($target->id);
            $previous = ['name' => $locked->nombre, 'email' => $locked->correo_electronico];
            $email = mb_strtolower($data['correo_electronico']);

            $name = PersonName::normalize($data['nombre']);

            $locked->fill(['nombre' => $name, 'correo_electronico' => $email]);

            if (! $locked->isDirty()) {
                return $locked;
            }

            if ($locked->isDirty('correo_electronico')) {
                $locked->correo_verificado_en = null;
            }

            $locked->save();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'usuario.perfil_actualizado',
                resourceType: 'usuario',
                resourceId: $locked->id,
                result: 'exito',
                metadata: [
                    'previous_name' => $previous['name'],
                    'previous_email' => $previous['email'],
                    'name_changed' => $previous['name'] !== $name,
                    'email_changed' => $previous['email'] !== $email,
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            // Si el correo estaba mal y nadie ha estrenado la cuenta, el acceso viaja solo al
            // correo corregido: no hay que acordarse de reenviarlo.
            if ($previous['email'] !== $email && $locked->debe_cambiar_contrasena) {
                $this->credentials->execute($locked, $actor, $request, 'correo_corregido');
            }

            return $locked->refresh();
        });
    }
}
