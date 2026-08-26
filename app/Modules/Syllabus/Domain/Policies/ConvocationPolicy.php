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
        return $user->active && $this->roles->hasRole(request(), RoleCode::Coordinator);
    }

    public function create(User $user): bool
    {
        return $this->viewAny($user) && $this->roles->resolve(request())?->carrera_id !== null;
    }

    public function view(User $user, Convocation $convocation): bool
    {
        $activeRole = $this->roles->resolve(request());

        return $user->active
            && $activeRole?->role->codigo === RoleCode::Coordinator->value
            && $activeRole->carrera_id === $convocation->carrera_id;
    }

    public function open(User $user, Convocation $convocation): bool
    {
        return $this->view($user, $convocation) && $convocation->estado === 'preparation';
    }

    public function extendDeadline(User $user, Convocation $convocation): bool
    {
        return $this->view($user, $convocation) && $convocation->estado !== 'closed';
    }
}
