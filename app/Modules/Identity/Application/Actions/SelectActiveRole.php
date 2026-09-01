<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class SelectActiveRole
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(User $user, string $assignmentId, Request $request): RoleAssignment
    {
        $assignment = RoleAssignment::query()
            ->effective()
            ->where('usuario_id', $user->id)
            ->with(['role:id,codigo,nombre', 'career:id,nombre'])
            ->find($assignmentId);

        if ($assignment === null || ! $this->roles->isEligible($assignment)) {
            throw new NotFoundHttpException;
        }

        return DB::transaction(function () use ($assignment, $request, $user): RoleAssignment {
            $this->audit->execute(
                actorId: $user->id,
                roleAssignmentId: $assignment->id,
                action: 'rol_activo.seleccionado',
                resourceType: 'asignacion_rol',
                resourceId: $assignment->id,
                result: 'exito',
                metadata: ['role' => $assignment->role->codigo],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            $request->session()->put('active_role_assignment_id', $assignment->id);

            return $assignment;
        });
    }
}
