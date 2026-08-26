<?php

namespace App\Modules\AiAssistance\Application;

use App\Modules\AiAssistance\Domain\Data\AiAnalysisInput;
use App\Modules\AiAssistance\Domain\Data\AiAnalysisResult;
use App\Modules\AiAssistance\Domain\Data\AiEvidenceInput;
use App\Modules\AiAssistance\Domain\Exceptions\AiContractException;

class AiResultContract
{
    public function validate(AiAnalysisInput $input, AiAnalysisResult $result): void
    {
        if (! hash_equals($input->requestId, $result->requestId)) {
            throw new AiContractException('La respuesta no corresponde a la solicitud fijada.');
        }
        if (! in_array($result->status, ['completed', 'inconclusive'], true)
            || $result->gatewayVersion === ''
            || mb_strlen($result->gatewayVersion) > 80) {
            throw new AiContractException('La respuesta no cumple el contrato de estado y versión.');
        }
        if ($result->status === 'inconclusive') {
            if ($result->inconclusiveReason === null
                || $result->inconclusiveReason === ''
                || mb_strlen($result->inconclusiveReason) > 80
                || $result->recommendations !== []) {
                throw new AiContractException('Una respuesta no concluyente debe indicar una causa segura y no incluir recomendaciones.');
            }

            return;
        }
        if ($result->inconclusiveReason !== null
            || $result->recommendations === []
            || count($result->recommendations) > $input->maxRecommendations) {
            throw new AiContractException('La respuesta completada tiene una cantidad inválida de recomendaciones.');
        }

        $allowedEvidence = array_fill_keys(
            array_map(fn (AiEvidenceInput $item): string => $item->id, $input->evidence),
            true,
        );
        foreach ($result->recommendations as $recommendation) {
            if (! in_array($recommendation->type, ['editorial', 'clarity', 'consistency'], true)
                || trim($recommendation->title) === ''
                || mb_strlen($recommendation->title) > 180
                || trim($recommendation->explanation) === ''
                || mb_strlen($recommendation->explanation) > (int) config('ai.limits.explanation_characters')
                || trim($recommendation->suggestedText) === ''
                || mb_strlen($recommendation->suggestedText) > (int) config('ai.limits.suggested_text_characters')
                || $recommendation->suggestedText === $input->content
                || str_contains($recommendation->suggestedText, "\0")
                || preg_match('/<\/?[a-z][^>]*>/i', $recommendation->suggestedText) === 1
                || count($recommendation->evidenceIds) !== count(array_unique($recommendation->evidenceIds))
                || $recommendation->evidenceIds === []) {
                throw new AiContractException('Una recomendación no cumple los límites del contrato.');
            }
            foreach (array_unique($recommendation->evidenceIds) as $evidenceId) {
                if (! isset($allowedEvidence[$evidenceId])) {
                    throw new AiContractException('La respuesta inventó una referencia fuera de la evidencia fijada.');
                }
            }
        }
    }
}
