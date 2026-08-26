<?php

namespace App\Modules\Integrations\Domain\Data;

final readonly class MappingResult
{
    /** @param array<string, bool|float|int|string>|null $normalized */
    public function __construct(
        public bool $valid,
        public ?array $normalized,
        public string $reasonCode,
    ) {}
}
