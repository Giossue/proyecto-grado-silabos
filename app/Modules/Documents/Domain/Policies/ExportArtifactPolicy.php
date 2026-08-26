<?php

namespace App\Modules\Documents\Domain\Policies;

use App\Models\User;
use App\Modules\Documents\Infrastructure\Persistence\Models\ExportArtifact;

class ExportArtifactPolicy
{
    public function view(User $user, ExportArtifact $artifact): bool
    {
        return $user->can('view', $artifact->revision);
    }

    public function download(User $user, ExportArtifact $artifact): bool
    {
        return $this->view($user, $artifact) && $artifact->estado === 'completed';
    }
}
