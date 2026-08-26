<?php

namespace App\Modules\Integrations\Domain\Contracts;

use App\Modules\Integrations\Domain\Data\InstitutionalRecord;
use App\Modules\Integrations\Domain\Data\MappingResult;

interface AcademicRecordMapper
{
    public function version(): string;

    public function map(InstitutionalRecord $record): MappingResult;
}
