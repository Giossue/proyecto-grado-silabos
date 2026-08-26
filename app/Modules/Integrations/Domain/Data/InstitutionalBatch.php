<?php

namespace App\Modules\Integrations\Domain\Data;

final readonly class InstitutionalBatch
{
    /** @param list<InstitutionalRecord> $records */
    public function __construct(
        public string $source,
        public string $readerVersion,
        public string $profile,
        public array $records,
    ) {}
}
