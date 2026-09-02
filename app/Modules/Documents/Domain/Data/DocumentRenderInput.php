<?php

namespace App\Modules\Documents\Domain\Data;

final readonly class DocumentRenderInput
{
    /** @param array<string, mixed> $snapshot */
    public function __construct(
        public string $subject,
        public string $subjectCode,
        public string $academicPeriod,
        public int $revisionNumber,
        public string $revisionFingerprint,
        public string $templateId,
        public string $generatedAt,
        public string $locale,
        public array $snapshot,
    ) {}
}
