<?php

namespace App\Modules\AiAssistance\Infrastructure\Gateways;

use App\Modules\AiAssistance\Domain\Contracts\AiAnalysisGateway;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisInput;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisResult;
use App\Modules\AiAssistance\Domain\Exceptions\AiGatewayUnavailable;

class DisabledAiAnalysisGateway implements AiAnalysisGateway
{
    public function version(): string
    {
        return 'disabled-v1';
    }

    public function analyze(AiAnalysisInput $input): AiAnalysisResult
    {
        throw new AiGatewayUnavailable('La asistencia de IA está deshabilitada en este entorno.');
    }
}
