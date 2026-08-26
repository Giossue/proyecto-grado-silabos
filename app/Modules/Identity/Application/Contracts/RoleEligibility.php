<?php

namespace App\Modules\Identity\Application\Contracts;

interface RoleEligibility
{
    public function allows(string $userId, string $roleCode, ?string $careerId): bool;
}
