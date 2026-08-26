<?php

namespace App\Modules\Configuration\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateSourceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('view-sources') === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'career_id' => ['nullable', 'uuid', Rule::exists('carreras', 'id')->where('activo', true)],
            'name' => ['required', 'string', 'max:180'],
            'type' => ['required', 'string', 'max:60'],
            'authority' => ['required', 'string', 'max:180'],
            'responsible' => ['required', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:2000'],
            'valid_from' => ['nullable', 'date'],
            'valid_until' => ['nullable', 'date', 'after_or_equal:valid_from'],
        ];
    }
}
