<?php

namespace App\Modules\Documents\Domain\Contracts;

use App\Modules\Documents\Domain\Data\DocumentBundle;
use App\Modules\Documents\Domain\Data\DocumentRenderInput;

interface DocumentRenderer
{
    public function version(): string;

    public function render(DocumentRenderInput $input): DocumentBundle;
}
