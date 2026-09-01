<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Application\CoordinationMandate;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SetUserStatus
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly CoordinationMandate $mandate,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(User $target, bool $active, User $actor, Request $request): User
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($active, $actor, $activeRole, $request, $target): User {
            $target->update([
                'activo' => $active,
                'desactivado_en' => $active ? null : now(),
            ]);

            $closedMandates = 0;

            if (! $active) {
                DB::table('sesiones')->where('user_id', $target->id)->delete();
                // Un nombramiento abierto de una cuenta desactivada bloquea la carrera:
                // la base no admite dos coordinaciones vigentes a la vez.
                $closedMandates = $this->mandate->closeFor($target->id);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: $active ? 'usuario.activado' : 'usuario.desactivado',
                resourceType: 'usuario',
                resourceId: $target->id,
                result: 'exito',
                metadata: ['closed_coordinations' => $closedMandates],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $target;
        });
    }
}
