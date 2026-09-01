<?php

namespace App\Modules\AiAssistance\Domain\Data;

final readonly class AiEvidenceInput
{
    public function __construct(
        public string $id,
        public string $sourceId,
        public string $sourceName,
        public string $excerpt,
        public string $fingerprint,
    ) {}

    /** @return array<string, string> */
    public function toGatewayPayload(): array
    {
        return [
            'evidence_id' => $this->id,
            'source_id' => $this->sourceId,
            'source_name' => $this->sourceName,
            'excerpt' => $this->excerpt,
            'fingerprint' => $this->fingerprint,
        ];
    }
}
