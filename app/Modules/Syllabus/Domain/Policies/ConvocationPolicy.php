<?php

namespace App\Modules\Syllabus\Domain\Policies;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;

class ConvocationPolicy
{
    public function __construct(private readonly ActiveRole $roles) {}

    public function viewAny(User $user): bool
    {
        return $user->activo && $this->roles->hasRole(request(), RoleCode::Coordinator);
    }

    public function create(User $user): bool
    {
        return $this->viewAny($user) && $this->roles->resolve(request())?->carrera_id !== null;
    }

    public function view(User $user, Convocation $convocation): bool
    {
        $activeRole = $this->roles->resolve(request());

        return $user->activo
            && $activeRole?->role->codigo === RoleCode::Coordinator->value
            && $activeRole->carrera_id === $convocation->carrera_id;
    }

    public function open(User $user, Convocation $convocation): bool
    {
        return $this->view($user, $convocation) && $convocation->estado === 'preparacion';
    }

    public function pause(User $user, Convocation $convocation): bool
    {
        return $this->view($user, $convocation) && $convocation->estado === Convocation::STATE_OPEN;
    }

    public function resume(User $user, Convocation $convocation): bool
    {
        return $this->view($user, $convocation) && $convocation->estado === Convocation::STATE_PAUSED;
    }

    /** Se corrige antes de abrir o en pausa: nunca con los docentes trabajando. */
    public function update(User $user, Convocation $convocation): bool
    {
        return false;
    }
}
