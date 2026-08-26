<?php

namespace App\Modules\Integrations\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ViewInstitutionalImportsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('operate-imports') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'in:pending,running,completed,failed'],
            'result' => ['nullable', 'string', 'in:conflict,rejected'],
            'run' => ['nullable', 'uuid'],
            'page' => ['nullable', 'integer', 'min:1'],
            'item_page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
