<?php

namespace App\Modules\Integrations\Domain\Data;

final readonly class InstitutionalRecord
{
    /** @param array<string, mixed> $payload */
    public function __construct(
        public int $rowNumber,
        public string $externalReference,
        public string $entityType,
        public array $payload,
    ) {}
}
