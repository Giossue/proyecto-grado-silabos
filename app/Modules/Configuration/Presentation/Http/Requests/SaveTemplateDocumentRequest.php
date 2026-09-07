<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

class SaveTemplateDocumentRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'document' => ['required', 'array'],
            'fingerprint' => ['required', 'string', 'size:64'],
            'title' => ['sometimes', 'required', 'string', 'max:180'],
            'confirm_purge' => ['nullable', 'boolean'],
        ];
    }
}
