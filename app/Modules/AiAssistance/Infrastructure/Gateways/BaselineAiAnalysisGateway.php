<?php

namespace App\Modules\AiAssistance\Infrastructure\Gateways;

use App\Modules\AiAssistance\Domain\Contracts\AiAnalysisGateway;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisInput;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisResult;
use App\Modules\AiAssistance\Domain\Data\AiRecommendationOutput;

class BaselineAiAnalysisGateway implements AiAnalysisGateway
{
    public function version(): string
    {
        return 'contract-simulator-v1';
    }

    public function analyze(AiAnalysisInput $input): AiAnalysisResult
    {
        $normalized = preg_replace('/[\t ]+/u', ' ', trim($input->content));
        $normalized = preg_replace('/\n{3,}/u', "\n\n", $normalized ?? '') ?? '';
        if ($normalized === '') {
            return new AiAnalysisResult(
                $input->requestId,
                'inconclusive',
                $this->version(),
                [],
                'empty_content',
            );
        }
        if (preg_match('/[.!?…]$/u', $normalized) !== 1) {
            $normalized .= '.';
        }
        if ($normalized === $input->content) {
            return new AiAnalysisResult(
                $input->requestId,
                'inconclusive',
                $this->version(),
                [],
                'no_editorial_change',
            );
        }

        return new AiAnalysisResult(
            $input->requestId,
            'completed',
            $this->version(),
            [new AiRecommendationOutput(
                'editorial',
                'Normalización editorial reproducible',
                'Se propone únicamente normalizar espacios y cierre de puntuación. El simulador no interpreta ni ejecuta instrucciones contenidas en las fuentes.',
                $normalized,
                array_map(fn ($item): string => $item->id, $input->evidence),
            )],
        );
    }
}
