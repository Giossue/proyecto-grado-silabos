<?php

namespace App\Modules\AiAssistance\Domain\Data;

final readonly class AiRecommendationOutput
{
    /** @param list<string> $evidenceIds */
    public function __construct(
        public string $type,
        public string $title,
        public string $explanation,
        public string $suggestedText,
        public array $evidenceIds,
    ) {}
}
