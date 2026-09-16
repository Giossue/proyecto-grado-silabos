<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCurriculumConfigurationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->activo === true
            && $this->user()->can('manage-career-academics') === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:80'],
            'cycle_count' => ['required', 'integer', 'min:1', 'max:30'],
        ];
    }
}
