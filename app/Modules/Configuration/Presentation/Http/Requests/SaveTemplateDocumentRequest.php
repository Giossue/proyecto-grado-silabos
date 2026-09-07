<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

class SaveTemplateDocumentRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'document' => ['present', 'nullable', 'array'],
            'fingerprint' => ['required', 'string', 'size:64'],
            'title' => ['sometimes', 'required', 'string', 'max:180'],
            'properties' => ['sometimes', 'array', 'max:500'],
            'properties.*' => ['required', 'array:key,help,ai_enabled'],
            'properties.*.key' => ['required', 'string', 'distinct', 'max:180'],
            'properties.*.help' => ['present', 'nullable', 'string', 'max:2000'],
            'properties.*.ai_enabled' => ['sometimes', 'boolean'],
            'confirm_purge' => ['nullable', 'boolean'],
        ];
    }
}
