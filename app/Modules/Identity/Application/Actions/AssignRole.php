<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Application\CoordinationMandate;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AssignRole
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly CoordinationMandate $mandate,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{role_code: string, career_id?: string|null, valid_from: string, valid_until?: string|null} $data */
    public function execute(User $target, array $data, User $actor, Request $request): RoleAssignment
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $data, $request, $target): RoleAssignment {
            $role = Role::query()->where('codigo', $data['role_code'])->firstOrFail();
            $careerId = $data['role_code'] === RoleCode::Administrator->value
                ? null
                : ($data['career_id'] ?? null);
            $assignment = RoleAssignment::query()->firstOrCreate(
                [
                    'usuario_id' => $target->id,
                    'rol_id' => $role->id,
                    'carrera_id' => $careerId,
                    'vigente_desde' => $data['valid_from'],
                ],
                [
                    'vigente_hasta' => $data['valid_until'] ?? null,
                    'activo' => true,
                ],
            );

            // Conceder la coordinación es concederla de verdad: sin nombramiento el rol
            // queda decorativo y la persona no puede activarlo.
            $mandate = $this->mandate->open(
                $target->id,
                $data['role_code'],
                $careerId,
                $data['valid_from'],
                $data['valid_until'] ?? null,
            );

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'usuario.rol_asignado',
                resourceType: 'usuario',
                resourceId: $target->id,
                result: 'exito',
                metadata: [
                    'role' => $data['role_code'],
                    'coordination_id' => $mandate?->id,
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $assignment;
        });
    }
}
