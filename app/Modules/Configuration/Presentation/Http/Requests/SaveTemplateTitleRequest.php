<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use App\Modules\Configuration\Domain\TemplateTitleBlock;

final class SaveTemplateTitleRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:'.TemplateTitleBlock::MAX_LENGTH],
            'confirm_purge' => ['nullable', 'boolean'],
        ];
    }
}
