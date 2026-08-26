<?php

namespace App\Modules\AiAssistance\Domain\Data;

final readonly class AiAnalysisResult
{
    /** @param list<AiRecommendationOutput> $recommendations */
    public function __construct(
        public string $requestId,
        public string $status,
        public string $gatewayVersion,
        public array $recommendations,
        public ?string $inconclusiveReason = null,
    ) {}
}
