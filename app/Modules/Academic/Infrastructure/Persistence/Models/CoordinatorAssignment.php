<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Illuminate\Database\Eloquent\Builder;

/**
 * @property string $id
 * @property string|null $rol_id
 * @property bool $activo
 * @property-read User $user
 * @property-read Career $career
 */
class CoordinatorAssignment extends RoleAssignment
{
    protected static function booted(): void
    {
        static::addGlobalScope('solo_coordinador', function (Builder $query): void {
            $query->whereHas('role', fn (Builder $role): Builder => $role
                ->where('codigo_rol', RoleCode::Coordinator->value));
        });

        static::creating(function (self $assignment): void {
            if (! array_key_exists('rol_id', $assignment->getAttributes())) {
                $assignment->rol_id = Role::query()
                    ->where('codigo_rol', RoleCode::Coordinator->value)
                    ->valueOrFail('id');
            }
        });
    }
}
