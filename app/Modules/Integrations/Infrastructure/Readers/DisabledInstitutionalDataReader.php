<?php

namespace App\Modules\Integrations\Infrastructure\Readers;

use App\Modules\Integrations\Domain\Contracts\InstitutionalDataReader;
use App\Modules\Integrations\Domain\Data\InstitutionalBatch;
use App\Modules\Integrations\Domain\Exceptions\InstitutionalReaderUnavailable;

class DisabledInstitutionalDataReader implements InstitutionalDataReader
{
    public function source(): string
    {
        return 'institutional-disabled';
    }

    public function version(): string
    {
        return 'disabled-v1';
    }

    public function read(string $profile): InstitutionalBatch
    {
        throw new InstitutionalReaderUnavailable('La lectura institucional está deshabilitada en este entorno.');
    }
}
