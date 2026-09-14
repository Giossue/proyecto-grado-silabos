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
use Illuminate\Validation\ValidationException;

class AssignRole
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{role_code: string, career_id?: string|null} $data */
    public function execute(User $target, array $data, User $actor, Request $request): RoleAssignment
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $data, $request, $target): RoleAssignment {
            $role = Role::query()->where('codigo', $data['role_code'])->firstOrFail();
            $careerId = $data['role_code'] === RoleCode::Administrator->value
                ? null
                : ($data['career_id'] ?? null);
            if ($data['role_code'] === RoleCode::Coordinator->value) {
                $alreadyCoordinated = RoleAssignment::query()
                    ->effective()
                    ->where('carrera_id', $careerId)
                    ->where('usuario_id', '!=', $target->id)
                    ->whereHas('user', fn ($query) => $query->where('activo', true))
                    ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Coordinator->value))
                    ->exists();
                if ($alreadyCoordinated) {
                    throw ValidationException::withMessages([
                        'role_code' => 'La carrera ya tiene una coordinación activa. Use el reemplazo de coordinación.',
                    ]);
                }
            }
            $assignment = RoleAssignment::query()->firstOrCreate(
                [
                    'usuario_id' => $target->id,
                    'rol_id' => $role->id,
                    'carrera_id' => $careerId,
                ],
                [
                    'activo' => true,
                ],
            );

            if (! $assignment->activo) {
                $assignment->update(['activo' => true]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'usuario.rol_asignado',
                resourceType: 'usuario',
                resourceId: $target->id,
                result: 'exito',
                metadata: [
                    'role' => $data['role_code'],
                    'career_id' => $careerId,
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $assignment;
        });
    }
}
