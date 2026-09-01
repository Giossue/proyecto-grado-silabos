<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

class CreateTemplateRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
