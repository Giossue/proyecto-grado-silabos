<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use Illuminate\Validation\Rule;

class CreateTemplateRequest extends ManageTemplatesRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:2000'],
            'career_id' => ['nullable', 'uuid', Rule::exists('carreras', 'id')->where('activo', true)],
        ];
    }
}
