<?php

namespace App\Modules\Syllabus\Domain\Exceptions;

use RuntimeException;

class DraftConflictException extends RuntimeException
{
    public function __construct(public readonly int $currentVersion)
    {
        parent::__construct('El borrador cambió en otra sesión. Recarga antes de continuar.');
    }
}
