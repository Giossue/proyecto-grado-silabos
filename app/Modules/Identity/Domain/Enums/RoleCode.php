<?php

namespace App\Modules\Identity\Domain\Enums;

enum RoleCode: string
{
    case Administrator = 'administrator';
    case Coordinator = 'coordinator';
    case Teacher = 'teacher';
}
