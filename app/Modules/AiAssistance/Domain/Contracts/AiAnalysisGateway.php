<?php

namespace App\Modules\AiAssistance\Domain\Contracts;

use App\Modules\AiAssistance\Domain\Data\AiAnalysisInput;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisResult;

interface AiAnalysisGateway
{
    public function version(): string;

    public function analyze(AiAnalysisInput $input): AiAnalysisResult;
}
