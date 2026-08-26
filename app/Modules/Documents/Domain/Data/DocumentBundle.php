<?php

namespace App\Modules\Documents\Domain\Data;

final readonly class DocumentBundle
{
    public function __construct(
        public RenderedDocument $docx,
        public RenderedDocument $pdf,
    ) {}
}
