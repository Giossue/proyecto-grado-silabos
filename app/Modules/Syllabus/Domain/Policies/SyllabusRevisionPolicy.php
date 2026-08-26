<?php

namespace App\Modules\Syllabus\Domain\Policies;

use App\Models\User;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;

class SyllabusRevisionPolicy
{
    public function view(User $user, SyllabusRevision $revision): bool
    {
        return $user->can('view', $revision->syllabus);
    }

    public function review(User $user, SyllabusRevision $revision): bool
    {
        return $user->can('review', $revision->syllabus);
    }
}
