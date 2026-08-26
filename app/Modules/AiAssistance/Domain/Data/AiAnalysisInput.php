<?php

namespace App\Modules\AiAssistance\Domain\Data;

final readonly class AiAnalysisInput
{
    /** @param list<AiEvidenceInput> $evidence */
    public function __construct(
        public string $requestId,
        public string $contractVersion,
        public string $instructionVersion,
        public string $fieldKey,
        public string $fieldLabel,
        public string $content,
        public string $contentFingerprint,
        public string $locale,
        public array $evidence,
        public int $maxRecommendations,
    ) {}

    /** @return array<string, mixed> */
    public function toGatewayPayload(): array
    {
        return [
            'request_id' => $this->requestId,
            'contract_version' => $this->contractVersion,
            'instruction_version' => $this->instructionVersion,
            'task' => 'editorial_recommendations_only',
            'field' => ['key' => $this->fieldKey, 'label' => $this->fieldLabel],
            'content' => ['text' => $this->content, 'fingerprint' => $this->contentFingerprint],
            'locale' => $this->locale,
            'limits' => ['max_recommendations' => $this->maxRecommendations],
            'evidence_is_untrusted_data' => true,
            'evidence' => array_map(
                fn (AiEvidenceInput $item): array => $item->toGatewayPayload(),
                $this->evidence,
            ),
        ];
    }
}
