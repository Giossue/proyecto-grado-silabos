<?php

namespace App\Modules\Integrations\Domain\Contracts;

use App\Modules\Integrations\Domain\Data\ReconciliationProposal;

interface ImportReconciler
{
    public function version(): string;

    /** @param array<string, bool|float|int|string> $normalized */
    public function propose(string $entityType, array $normalized): ReconciliationProposal;
}
