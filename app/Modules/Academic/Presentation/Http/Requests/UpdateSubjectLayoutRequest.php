<?php

namespace App\Modules\Academic\Presentation\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSubjectLayoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->activo === true
            && $this->user()->can('manage-career-academics') === true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'subject_id' => ['required', 'uuid'],
            'cycle' => ['required', 'integer', 'min:1', 'max:30'],
            'position' => ['required', 'integer', 'min:0', 'max:999'],
        ];
    }
}
