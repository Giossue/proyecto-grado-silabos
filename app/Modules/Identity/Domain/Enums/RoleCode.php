<?php

namespace App\Modules\Identity\Domain\Enums;

enum RoleCode: string
{
    case Administrator = 'administrador';
    case Coordinator = 'coordinador';
    case Teacher = 'docente';

    public function label(): string
    {
        return match ($this) {
            self::Administrator => 'Administrador',
            self::Coordinator => 'Coordinador',
            self::Teacher => 'Docente',
        };
    }
}
