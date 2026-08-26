<?php

namespace App\Modules\Documents\Domain\Data;

final readonly class RenderedDocument
{
    public function __construct(
        public string $format,
        public string $mime,
        public string $extension,
        public string $bytes,
    ) {}

    public function fingerprint(): string
    {
        return hash('sha256', $this->bytes);
    }

    public function size(): int
    {
        return strlen($this->bytes);
    }
}
