<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSubjectRequirementRequest extends FormRequest
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
            'subject_id' => ['required', 'uuid'],
            'requirement_id' => ['required', 'uuid', 'different:subject_id'],
            'type' => ['required', 'string', 'max:30', Rule::in(['prerrequisito', 'correquisito'])],
        ];
    }
}
