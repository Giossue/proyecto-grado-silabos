<?php

namespace App\Modules\Integrations\Domain\Contracts;

use App\Modules\Integrations\Domain\Data\InstitutionalBatch;

interface InstitutionalDataReader
{
    public function source(): string;

    public function version(): string;

    public function read(string $profile): InstitutionalBatch;
}
