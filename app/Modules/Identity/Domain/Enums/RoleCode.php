<?php

namespace App\Modules\Identity\Domain\Enums;

enum RoleCode: string
{
    case Administrator = 'administrador';
    case Coordinator = 'coordinador';
    case Teacher = 'docente';
}
