<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
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

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'user.role_assigned',
                resourceType: 'user',
                resourceId: $target->id,
                result: 'success',
                metadata: ['role' => $data['role_code']],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $assignment;
        });
    }
}
