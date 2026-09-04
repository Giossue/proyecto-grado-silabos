<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Identity\Application\Actions\AssignRole;
use App\Modules\Identity\Application\Actions\SetUserStatus;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Cambia quién coordina una carrera en un solo paso (I-39): cierra el nombramiento y el
 * rol de quien sale, abre los de quien entra (concediéndole el rol si no lo tiene) y,
 * si se pide y ya no le queda ningún rol vigente, desactiva la cuenta saliente. Sirve
 * también para nombrar a la primera persona cuando la carrera no tiene coordinación.
 *
 * @phpstan-type Result array{previous_user_id: string|null, role_removed: bool, deactivated: bool}
 */
class ReplaceCoordinator
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly AssignRole $assignRole,
        private readonly SetUserStatus $setStatus,
        private readonly RecordAuditEvent $audit,
    ) {}

    /**
     * @param  array{incoming_user_id: string, deactivate_outgoing?: bool}  $data
     * @return Result
     */
    public function execute(Career $career, array $data, User $actor, Request $request): array
    {
        $activeRole = $this->roles->resolve($request);
        $incoming = User::query()->where('activo', true)->find($data['incoming_user_id']);
        if ($incoming === null) {
            throw ValidationException::withMessages([
                'incoming_user_id' => 'La cuenta entrante no existe o está desactivada.',
            ]);
        }

        return DB::transaction(function () use ($actor, $activeRole, $career, $data, $incoming, $request): array {
            $lockedCareer = Career::query()->whereKey($career->id)->lockForUpdate()->firstOrFail();
            $current = CoordinatorAssignment::query()
                ->effective()
                ->where('carrera_id', $lockedCareer->id)
                ->lockForUpdate()
                ->first();

            if ($current !== null && $current->usuario_id === $incoming->id) {
                throw ValidationException::withMessages([
                    'incoming_user_id' => 'Esa persona ya coordina la carrera.',
                ]);
            }

            $roleRemoved = false;
            $deactivated = false;
            if ($current !== null) {
                $current->update(['vigente_hasta' => now(), 'activo' => false]);
                // El rol en esta carrera se cierra con el nombramiento; los roles en
                // otras carreras (o el de docente aquí) no se tocan.
                $roleRemoved = RoleAssignment::query()
                    ->effective()
                    ->where('usuario_id', $current->usuario_id)
                    ->where('carrera_id', $lockedCareer->id)
                    ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Coordinator->value))
                    ->update(['activo' => false]) > 0;
            }

            // Conceder el rol abre también el nombramiento (`CoordinationMandate::open`).
            $this->assignRole->execute($incoming, [
                'role_code' => RoleCode::Coordinator->value,
                'career_id' => $lockedCareer->id,
            ], $actor, $request);

            if ($current !== null && (bool) ($data['deactivate_outgoing'] ?? false)) {
                $outgoing = User::query()->lockForUpdate()->find($current->usuario_id);
                $hasOtherRoles = RoleAssignment::query()->effective()->where('usuario_id', $current->usuario_id)->exists();
                if ($outgoing !== null && $outgoing->activo && ! $hasOtherRoles && $outgoing->id !== $actor->id) {
                    $this->setStatus->execute($outgoing, false, $actor, $request);
                    $deactivated = true;
                }
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'academico.coordinacion.reemplazada',
                resourceType: 'carrera',
                resourceId: $lockedCareer->id,
                result: 'exito',
                metadata: [
                    'previous_user_id' => $current?->usuario_id,
                    'incoming_user_id' => $incoming->id,
                    'role_removed' => $roleRemoved,
                    'deactivated' => $deactivated,
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return ['previous_user_id' => $current?->usuario_id, 'role_removed' => $roleRemoved, 'deactivated' => $deactivated];
        });
    }
}
