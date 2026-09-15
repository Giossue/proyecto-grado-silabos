<?php

namespace App\Modules\Identity\Domain;

use App\Modules\Identity\Domain\Enums\RoleCode;

/** Valor de presentación derivado del enum fijo; no representa una tabla ni relación. */
final readonly class FixedRole
{
    private function __construct(
        public string $codigo_rol,
        public string $nombre_rol,
    ) {}

    public static function fromCode(string $code): self
    {
        $role = RoleCode::from($code);

        return new self($role->value, $role->label());
    }
}
