<?php

namespace App\Modules\AiAssistance\Domain\Data;

final readonly class AiEvidenceInput
{
    public function __construct(
        public string $id,
        public string $sourceId,
        public string $sourceName,
        public string $sourceAuthority,
        public string $sourceVersionId,
        public int $sourceVersion,
        public string $fragmentId,
        public string $fragmentKey,
        public string $fragmentTitle,
        public string $excerpt,
        public string $fingerprint,
    ) {}

    /** @return array<string, int|string> */
    public function toGatewayPayload(): array
    {
        return [
            'evidence_id' => $this->id,
            'source_id' => $this->sourceId,
            'source_name' => $this->sourceName,
            'source_authority' => $this->sourceAuthority,
            'source_version_id' => $this->sourceVersionId,
            'source_version' => $this->sourceVersion,
            'fragment_id' => $this->fragmentId,
            'fragment_key' => $this->fragmentKey,
            'fragment_title' => $this->fragmentTitle,
            'excerpt' => $this->excerpt,
            'fingerprint' => $this->fingerprint,
        ];
    }
}
