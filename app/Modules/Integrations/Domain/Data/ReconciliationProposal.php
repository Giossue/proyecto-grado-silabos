<?php

namespace App\Modules\Integrations\Domain\Data;

final readonly class ReconciliationProposal
{
    /** @param list<string> $candidateIds */
    public function __construct(
        public string $result,
        public ?string $proposedAction,
        public string $reasonCode,
        public ?string $candidateType,
        public ?string $candidateId,
        public array $candidateIds,
    ) {}
}
