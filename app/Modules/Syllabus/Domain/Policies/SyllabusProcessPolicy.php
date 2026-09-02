<?php

namespace App\Modules\Syllabus\Domain\Policies;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;

/**
 * El calendario institucional es de Administración. Coordinación lo consulta al preparar
 * su convocatoria, pero no lo crea ni lo mueve de estado.
 */
class SyllabusProcessPolicy
{
    public function __construct(private readonly ActiveRole $roles) {}

    public function viewAny(User $user): bool
    {
        return $user->activo && $this->roles->hasRole(request(), RoleCode::Administrator);
    }

    public function create(User $user): bool
    {
        return $this->viewAny($user);
    }

    public function update(User $user, SyllabusProcess $process): bool
    {
        return $this->viewAny($user) && $process->isConfigurable();
    }

    public function open(User $user, SyllabusProcess $process): bool
    {
        return $this->viewAny($user) && $process->estado === SyllabusProcess::STATE_PREPARATION;
    }

    public function pause(User $user, SyllabusProcess $process): bool
    {
        return $this->viewAny($user) && $process->estado === SyllabusProcess::STATE_OPEN;
    }

    public function resume(User $user, SyllabusProcess $process): bool
    {
        return $this->viewAny($user) && $process->estado === SyllabusProcess::STATE_PAUSED;
    }

    public function extendDeadline(User $user, SyllabusProcess $process): bool
    {
        return $this->viewAny($user) && $process->estado !== SyllabusProcess::STATE_CLOSED;
    }

    public function close(User $user, SyllabusProcess $process): bool
    {
        return $this->viewAny($user)
            && in_array($process->estado, [SyllabusProcess::STATE_OPEN, SyllabusProcess::STATE_PAUSED], true);
    }
}
