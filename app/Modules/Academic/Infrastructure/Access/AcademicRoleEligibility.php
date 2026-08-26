<?php

namespace App\Modules\Academic\Infrastructure\Access;

use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Identity\Application\Contracts\RoleEligibility;
use App\Modules\Identity\Domain\Enums\RoleCode;

final class AcademicRoleEligibility implements RoleEligibility
{
    public function allows(string $userId, string $roleCode, ?string $careerId): bool
    {
        if ($roleCode !== RoleCode::Coordinator->value) {
            return true;
        }

        if ($careerId === null) {
            return false;
        }

        return CoordinatorAssignment::query()
            ->effective()
            ->where('usuario_id', $userId)
            ->where('carrera_id', $careerId)
            ->exists();
    }
}
