<?php

namespace App\Modules\Identity\Domain\Policies;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;

class UserPolicy
{
    public function __construct(private readonly ActiveRole $roles) {}

    public function viewAny(User $actor): bool
    {
        return $actor->activo && $this->roles->hasRole(request(), RoleCode::Administrator);
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

    /** Reenviar el acceso o borrar: solo cuentas que nadie ha estrenado (I-38). */
    public function managePending(User $actor, User $target): bool
    {
        return $this->update($actor, $target) && $target->debe_cambiar_contrasena;
    }

    /**
     * Corregir el nombre o el correo de una cuenta. Es distinto de `update`, que gobierna
     * el estado y los roles: aquí no se toca lo que alguien puede hacer, solo cómo se le
     * nombra y por dónde se le escribe.
     *
     * La identidad de la cuenta pertenece a Administración. Coordinar una carrera o ser
     * titular de la cuenta no concede permiso para cambiar nombre o correo.
     */
    public function updateProfileData(User $actor, User $target): bool
    {
        if (! $actor->activo) {
            return false;
        }

        $activeRole = $this->roles->resolve(request());

        return $activeRole?->role->codigo === RoleCode::Administrator->value;
    }
}
