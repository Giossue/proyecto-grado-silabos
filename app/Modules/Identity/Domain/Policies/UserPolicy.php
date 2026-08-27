<?php

namespace App\Modules\Identity\Domain\Policies;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;

class UserPolicy
{
    public function __construct(private readonly ActiveRole $roles) {}

    public function viewAny(User $actor): bool
    {
        return $actor->active && $this->roles->hasRole(request(), RoleCode::Administrator);
    }

    public function create(User $actor): bool
    {
        return $this->viewAny($actor);
    }

    public function view(User $actor, User $target): bool
    {
        return $this->viewAny($actor);
    }

    public function update(User $actor, User $target): bool
    {
        return $this->viewAny($actor) && $actor->id !== $target->id;
    }

    /**
     * Corregir el nombre o el correo de una cuenta. Es distinto de `update`, que gobierna
     * el estado y los roles: aquí no se toca lo que alguien puede hacer, solo cómo se le
     * nombra y por dónde se le escribe.
     *
     * La administración alcanza a cualquiera. Una coordinación, solo a los docentes con
     * rol vigente en su carrera: nadie corrige datos de personas que no dirige.
     */
    public function updateProfileData(User $actor, User $target): bool
    {
        if (! $actor->active || ! $target->active) {
            return false;
        }

        $activeRole = $this->roles->resolve(request());

        if ($activeRole?->role->codigo === RoleCode::Administrator->value) {
            return true;
        }

        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value
            || $activeRole->carrera_id === null) {
            return false;
        }

        return RoleAssignment::query()
            ->where('usuario_id', $target->id)
            ->where('carrera_id', $activeRole->carrera_id)
            ->whereHas('role', fn ($role) => $role->where('codigo', RoleCode::Teacher->value))
            ->effective()
            ->exists();
    }
}
