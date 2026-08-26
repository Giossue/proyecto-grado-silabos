<?php

namespace App\Modules\Integrations\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ExcludeImportConflictRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('operate-imports') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'justification' => ['required', 'string', 'min:20', 'max:2000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $justification = $this->input('justification');
        if (is_string($justification)) {
            $this->merge(['justification' => trim($justification)]);
        }
    }
}
